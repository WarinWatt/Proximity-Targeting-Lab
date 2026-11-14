<?php
declare(strict_types=1);
return static function(PDO $db):void{
    foreach(['UPDATE','DELETE'] as $operation){
        $name='cycle_ledger_no_'.strtolower($operation);
        $db->exec("CREATE OR REPLACE TRIGGER {$name} BEFORE {$operation} ON cycle_ledger FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Pilot ledger is append-only'");
    }
    $db->exec("CREATE OR REPLACE TRIGGER cycle_ledger_validate BEFORE INSERT ON cycle_ledger FOR EACH ROW BEGIN IF NEW.kind NOT IN ('charge','refund') OR (NEW.kind='charge' AND NEW.amount<=0) OR (NEW.kind='refund' AND NEW.amount>=0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid pilot ledger entry'; END IF; END");
};
