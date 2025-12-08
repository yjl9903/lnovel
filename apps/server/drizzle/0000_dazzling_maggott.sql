CREATE TABLE `bili_chapters` (
	`cid` integer PRIMARY KEY NOT NULL,
	`vid` integer NOT NULL,
	`nid` integer NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`images` text DEFAULT '[]' NOT NULL,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`vid`) REFERENCES `bili_volumes`(`vid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`nid`) REFERENCES `bili_novels`(`nid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bili_novels` (
	`nid` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`cover` text,
	`label` text DEFAULT '[]',
	`updated_at` integer NOT NULL,
	`done` integer DEFAULT false,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bili_volumes` (
	`vid` integer PRIMARY KEY NOT NULL,
	`nid` integer NOT NULL,
	`name` text NOT NULL,
	`volume` text NOT NULL,
	`description` text NOT NULL,
	`cover` text,
	`label` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`nid`) REFERENCES `bili_novels`(`nid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `folos` (
	`url` text PRIMARY KEY NOT NULL,
	`feed_id` text NOT NULL
);
