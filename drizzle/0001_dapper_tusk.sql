ALTER TABLE "user_files" ADD COLUMN "file_url" varchar(512) NOT NULL;--> statement-breakpoint
ALTER TABLE "user_files" ADD COLUMN "content" text;--> statement-breakpoint
ALTER TABLE "user_files" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "user_files" DROP COLUMN IF EXISTS "file_path";