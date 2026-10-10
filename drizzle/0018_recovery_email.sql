ALTER TABLE `user` ADD `recovery_email` text;--> statement-breakpoint
CREATE UNIQUE INDEX `user_recovery_email_unique` ON `user` (`recovery_email`);