-- Deux stratégies seulement : « Équilibre » (BALANCE) devient « Payer le moins possible ».
UPDATE `review` SET `strategy` = 'ECONOMY' WHERE `strategy` = 'BALANCE';
