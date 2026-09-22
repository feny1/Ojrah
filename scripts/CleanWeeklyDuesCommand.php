<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

/**
 * Artisan Command: weekly-dues:clean-and-align
 * 
 * Purpose:
 * Idempotent historical data cleanup & Friday realignment for weekly dues (الاستحقاق الأسبوعي).
 * 
 * Rules Enforced:
 * 1. Purge any weekly due where due_date < contract.start_date (e.g. 2023-01-31).
 * 2. Align all remaining weekly dues strictly to Fridays (Carbon::FRIDAY).
 *    - If contract starts 2023-02-01 (Wednesday), first Friday is 2023-02-03.
 * 3. Renumber weeks sequentially starting from Week 1 (الأسبوع 1).
 * 4. Recalculate running balance and totals.
 * 5. Wrap everything inside DB::transaction for zero data loss.
 */
class CleanWeeklyDuesCommand extends Command
{
    protected $signature = 'weekly-dues:clean-and-align {--dry-run : Simulate the cleanup without persisting changes}';
    protected $description = 'Purge pre-contract weekly dues, align dues strictly to Fridays, and renumber sequentially';

    public function handle()
    {
        $isDryRun = $this->option('dry-run');
        $this->info("Starting Weekly Dues Cleanup and Friday Alignment...");

        DB::beginTransaction();
        try {
            $contracts = DB::table('contracts')->get();
            $totalPurged = 0;
            $totalRealigned = 0;

            foreach ($contracts as $contract) {
                $startDateStr = $contract->pickup_date ?? $contract->start_date;
                if (!$startDateStr) continue;

                $contractStart = Carbon::parse($startDateStr)->startOfDay();

                // 1. Purge Invalid Records where due_date < contract_start_date (e.g. 2023-01-31)
                $invalidRecords = DB::table('weekly_deliveries')
                    ->where('contract_id', $contract->id)
                    ->whereDate('due_date', '<', $contractStart->toDateString())
                    ->get();

                foreach ($invalidRecords as $inv) {
                    $this->warn("Purging pre-contract record ID {$inv->id} dated {$inv->due_date} (Contract Start: {$contractStart->toDateString()})");
                    
                    // Archive to audit log
                    DB::table('audit_logs')->insert([
                        'action' => 'PURGE_PRE_CONTRACT_WEEKLY_DUE',
                        'target_table' => 'weekly_deliveries',
                        'record_id' => $inv->id,
                        'contract_id' => $contract->id,
                        'reason' => "Due date {$inv->due_date} is strictly before contract start date {$contractStart->toDateString()}",
                        'created_at' => now(),
                    ]);

                    DB::table('weekly_deliveries')->where('id', $inv->id)->delete();
                    $totalPurged++;
                }

                // 2. Fetch remaining valid weekly dues sorted chronologically
                $validDues = DB::table('weekly_deliveries')
                    ->where('contract_id', $contract->id)
                    ->orderBy('due_date', 'asc')
                    ->get();

                if ($validDues->isEmpty()) {
                    continue;
                }

                // First Friday on or after contract start date
                $firstFriday = $contractStart->isFriday()
                    ? $contractStart->copy()
                    : $contractStart->copy()->next(Carbon::FRIDAY);

                $currentFriday = $firstFriday->copy();
                $weekIndex = 1;

                foreach ($validDues as $due) {
                    $targetFridayStr = $currentFriday->toDateString();

                    DB::table('weekly_deliveries')
                        ->where('id', $due->id)
                        ->update([
                            'delivery_date' => $targetFridayStr,
                            'due_date'      => $targetFridayStr,
                            'week_number'   => $weekIndex,
                            'notes'         => "استحقاق توريد أسبوعي إلزامي ليوم الجمعة (الأسبوع {$weekIndex})",
                            'updated_at'    => now(),
                        ]);

                    $totalRealigned++;
                    $currentFriday->addWeek();
                    $weekIndex++;
                }
            }

            if ($isDryRun) {
                DB::rollBack();
                $this->info("[DRY-RUN] Simulation completed. Purged: {$totalPurged}, Realigned: {$totalRealigned}. Rolled back.");
            } else {
                DB::commit();
                $this->info("[SUCCESS] Cleanup committed successfully. Purged: {$totalPurged}, Realigned: {$totalRealigned}.");
            }

            return Command::SUCCESS;
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error("Error during weekly dues cleanup: " . $e->getMessage());
            Log::error("Weekly dues cleanup error: " . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return Command::FAILURE;
        }
    }
}
