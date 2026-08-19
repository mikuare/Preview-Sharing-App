


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."branch_type" AS ENUM (
    'ADC',
    'QGDC',
    'QMB'
);


ALTER TYPE "public"."branch_type" OWNER TO "postgres";


CREATE TYPE "public"."project_status" AS ENUM (
    'active',
    'inactive',
    'completed',
    'not_started',
    'ongoing',
    'terminated',
    'implemented'
);


ALTER TYPE "public"."project_status" OWNER TO "postgres";


CREATE TYPE "public"."report_status" AS ENUM (
    'pending',
    'catered',
    'cancelled'
);


ALTER TYPE "public"."report_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_credentials_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_credentials_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "setting_key" "text" NOT NULL,
    "setting_value" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid"
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_implementations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'implemented'::"text",
    "completion_date" "date",
    "implementation_notes" "text",
    "verification_images" "text",
    "verification_documents" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "timekeeper_name" "text"
);


ALTER TABLE "public"."project_implementations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."project_implementations"."timekeeper_name" IS 'Name of the time keeper/checker who verified the project implementation';



CREATE TABLE IF NOT EXISTS "public"."project_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid",
    "category" "text" NOT NULL,
    "reporter_name" "text",
    "reporter_email" "text",
    "reporter_phone" "text",
    "message" "text" NOT NULL,
    "proof_urls" "text"[],
    "status" "public"."report_status" DEFAULT 'pending'::"public"."report_status",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "resolution_message" "text",
    "resolved_by" "text"
);


ALTER TABLE "public"."project_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "text" NOT NULL,
    "description" "text" NOT NULL,
    "status" "public"."project_status" DEFAULT 'active'::"public"."project_status",
    "project_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "engineer_name" "text" NOT NULL,
    "user_name" "text" NOT NULL,
    "contact_phone" "text",
    "contact_email" "text",
    "contact_social" "text",
    "branch" "public"."branch_type" NOT NULL,
    "latitude" numeric(10,8) NOT NULL,
    "longitude" numeric(11,8) NOT NULL,
    "image_url" "text",
    "additional_details" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "category_type" "text",
    "region" "text",
    "province" "text",
    "year" integer,
    "document_urls" "text",
    "effectivity_date" "date",
    "actual_start_date" "date",
    "expiry_date" "date",
    "contract_cost" numeric
);

ALTER TABLE ONLY "public"."projects" REPLICA IDENTITY FULL;


ALTER TABLE "public"."projects" OWNER TO "postgres";


COMMENT ON COLUMN "public"."projects"."effectivity_date" IS 'The date when the project becomes effective';



COMMENT ON COLUMN "public"."projects"."actual_start_date" IS 'The actual start date of the project';



COMMENT ON COLUMN "public"."projects"."expiry_date" IS 'The expiry date of the project';



COMMENT ON COLUMN "public"."projects"."contract_cost" IS 'The contract cost of the project';



CREATE TABLE IF NOT EXISTS "public"."user_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "username" "text" NOT NULL,
    "password" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid"
);


ALTER TABLE "public"."user_credentials" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_credentials" IS 'Stores shared credentials for regular users to authenticate before entering projects';



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_setting_key_key" UNIQUE ("setting_key");



ALTER TABLE ONLY "public"."project_implementations"
    ADD CONSTRAINT "project_implementations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_implementations"
    ADD CONSTRAINT "project_implementations_project_id_key" UNIQUE ("project_id");



ALTER TABLE ONLY "public"."project_reports"
    ADD CONSTRAINT "project_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_credentials"
    ADD CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_credentials"
    ADD CONSTRAINT "user_credentials_username_key" UNIQUE ("username");



CREATE INDEX "idx_app_settings_key" ON "public"."app_settings" USING "btree" ("setting_key");



CREATE INDEX "idx_projects_category" ON "public"."projects" USING "btree" ("category_type");



CREATE INDEX "idx_projects_region" ON "public"."projects" USING "btree" ("region");



CREATE INDEX "idx_projects_status" ON "public"."projects" USING "btree" ("status");



CREATE INDEX "idx_projects_year" ON "public"."projects" USING "btree" ("year");



CREATE OR REPLACE TRIGGER "update_app_settings_updated_at" BEFORE UPDATE ON "public"."app_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_projects_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_credentials_updated_at" BEFORE UPDATE ON "public"."user_credentials" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_credentials_updated_at"();



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."project_implementations"
    ADD CONSTRAINT "project_implementations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_reports"
    ADD CONSTRAINT "project_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_credentials"
    ADD CONSTRAINT "user_credentials_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_credentials"
    ADD CONSTRAINT "user_credentials_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



CREATE POLICY "Allow admins to update reports" ON "public"."project_reports" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow admins to view reports" ON "public"."project_reports" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow public insert reports" ON "public"."project_reports" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can read user credentials" ON "public"."user_credentials" FOR SELECT USING (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."project_implementations" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for all users" ON "public"."project_implementations" FOR SELECT USING (true);



CREATE POLICY "Enable update for authenticated users only" ON "public"."project_implementations" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Only admins can delete user credentials" ON "public"."user_credentials" FOR DELETE TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Only admins can insert user credentials" ON "public"."user_credentials" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Only admins can update user credentials" ON "public"."user_credentials" FOR UPDATE TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Only authenticated users can delete settings" ON "public"."app_settings" FOR DELETE USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Only authenticated users can insert settings" ON "public"."app_settings" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Only authenticated users can update settings" ON "public"."app_settings" FOR UPDATE USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Settings are viewable by everyone" ON "public"."app_settings" FOR SELECT USING (true);



CREATE POLICY "allow_all_insert" ON "public"."projects" FOR INSERT WITH CHECK (true);



CREATE POLICY "allow_all_select" ON "public"."projects" FOR SELECT USING (true);



CREATE POLICY "allow_authenticated_delete" ON "public"."projects" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "allow_authenticated_update" ON "public"."projects" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_implementations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_credentials" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."projects";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_credentials_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_credentials_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_credentials_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."project_implementations" TO "anon";
GRANT ALL ON TABLE "public"."project_implementations" TO "authenticated";
GRANT ALL ON TABLE "public"."project_implementations" TO "service_role";



GRANT ALL ON TABLE "public"."project_reports" TO "anon";
GRANT ALL ON TABLE "public"."project_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."project_reports" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."user_credentials" TO "anon";
GRANT ALL ON TABLE "public"."user_credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."user_credentials" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";


  create policy "Anyone can delete project documents"
  on "storage"."objects"
  as permissive
  for delete
  to public
using ((bucket_id = 'project-documents'::text));



  create policy "Anyone can delete project images"
  on "storage"."objects"
  as permissive
  for delete
  to public
using ((bucket_id = 'project-images'::text));



  create policy "Anyone can update their project documents"
  on "storage"."objects"
  as permissive
  for update
  to public
using ((bucket_id = 'project-documents'::text));



  create policy "Anyone can update their project images"
  on "storage"."objects"
  as permissive
  for update
  to public
using ((bucket_id = 'project-images'::text));



  create policy "Anyone can upload project documents"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check ((bucket_id = 'project-documents'::text));



  create policy "Anyone can upload project images"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check ((bucket_id = 'project-images'::text));



  create policy "Anyone can view project documents"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'project-documents'::text));



  create policy "Anyone can view project images"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'project-images'::text));



  create policy "Public Access Proofs"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'report-proofs'::text));



  create policy "Public Upload Proofs"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check ((bucket_id = 'report-proofs'::text));



