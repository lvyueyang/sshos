ALTER TABLE `connection` RENAME COLUMN `password_enc` TO `password`;--> statement-breakpoint
ALTER TABLE `connection` RENAME COLUMN `private_key_enc` TO `private_key`;--> statement-breakpoint
ALTER TABLE `connection` RENAME COLUMN `passphrase_enc` TO `passphrase`;