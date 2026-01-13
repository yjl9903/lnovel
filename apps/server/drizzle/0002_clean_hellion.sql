ALTER TABLE `bili_novels` RENAME COLUMN "author" TO "authors";--> statement-breakpoint
ALTER TABLE `bili_volumes` ADD `done` integer DEFAULT false;