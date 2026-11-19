/*
 Navicat Premium Dump SQL

 Source Server         : HOSxP_DB_Slave
 Source Server Type    : PostgreSQL
 Source Server Version : 150008 (150008)
 Source Host           : 172.16.84.4:6432
 Source Catalog        : nanhosxp
 Source Schema         : public

 Target Server Type    : PostgreSQL
 Target Server Version : 150008 (150008)
 File Encoding         : 65001

 Date: 19/11/2026 11:11:05
*/


-- ----------------------------
-- Table structure for asm_lr_record_after_birth_nan
-- ----------------------------
DROP TABLE IF EXISTS "public"."asm_lr_record_after_birth_nan";
CREATE TABLE "public"."asm_lr_record_after_birth_nan" (
  "asm_lr_record_after_birth_nan_id" int4 NOT NULL,
  "vnan" varchar(13) COLLATE "pg_catalog"."default",
  "assessment_head_id" int4,
  "patient_type" varchar(10) COLLATE "pg_catalog"."default",
  "vn" varchar(13) COLLATE "pg_catalog"."default",
  "an" varchar(9) COLLATE "pg_catalog"."default",
  "asm_date1" date,
  "asm_time1" time(6),
  "asm_time2" time(6),
  "asm_time3" time(6),
  "asm_time4" time(6),
  "asm_time5" time(6),
  "asm_time6" time(6),
  "asm_text1" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text2" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text3" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text4" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text5" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text6" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text7" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text8" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text9" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text10" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text11" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text12" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text13" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text14" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text15" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text16" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text17" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text18" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text19" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text20" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text21" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text22" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text23" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text24" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text25" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text26" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text27" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text28" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text49" varchar(150) COLLATE "pg_catalog"."default",
  "asm_text50" varchar(150) COLLATE "pg_catalog"."default",
  "asm_chk1" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk2" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk3" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk4" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk5" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk6" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk7" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk8" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk9" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk10" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk11" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk12" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk13" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk14" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk15" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk16" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk17" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk18" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk19" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk20" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk21" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk22" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk23" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk24" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk25" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk26" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk27" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk28" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk29" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk30" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk31" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk32" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk33" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk34" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk35" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk36" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk37" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk38" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk39" varchar(100) COLLATE "pg_catalog"."default",
  "asm_chk40" varchar(100) COLLATE "pg_catalog"."default",
  "asm_lk1" varchar(100) COLLATE "pg_catalog"."default",
  "asm_lk2" varchar(100) COLLATE "pg_catalog"."default",
  "asm_lk3" varchar(100) COLLATE "pg_catalog"."default",
  "asm_lk4" varchar(100) COLLATE "pg_catalog"."default",
  "asm_lk5" varchar(100) COLLATE "pg_catalog"."default",
  "asm_lk6" varchar(100) COLLATE "pg_catalog"."default",
  "asm_memo1" text COLLATE "pg_catalog"."default",
  "asm_memo2" text COLLATE "pg_catalog"."default",
  "asm_memo3" text COLLATE "pg_catalog"."default",
  "asm_memo4" text COLLATE "pg_catalog"."default",
  "asm_memo5" text COLLATE "pg_catalog"."default",
  "user_login" varchar(50) COLLATE "pg_catalog"."default"
)
;

-- ----------------------------
-- Indexes structure for table asm_lr_record_after_birth_nan
-- ----------------------------
CREATE INDEX "ix_assessment_head_id_309" ON "public"."asm_lr_record_after_birth_nan" USING btree (
  "assessment_head_id" "pg_catalog"."int4_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table asm_lr_record_after_birth_nan
-- ----------------------------
ALTER TABLE "public"."asm_lr_record_after_birth_nan" ADD CONSTRAINT "asm_lr_record_after_birth_nan_id" PRIMARY KEY ("asm_lr_record_after_birth_nan_id");
