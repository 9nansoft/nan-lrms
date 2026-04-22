// Thai geographic + MOPH hospital registry lookup data.
//
// Extracted from a live HOSxP MySQL on 2026-04-22:
//   - province            (78 rows)   SELECT province_code, province_name FROM province
//   - district           (1141 rows)  SELECT district_code, district_name, province_code FROM district
//   - tambol             (8821 rows)  SELECT tambol_code, tambol_name, district_code FROM tambol
//   - hospcode (filtered)(1656 rows)  SELECT ... FROM hospcode
//                                     WHERE LENGTH(hospcode) = 5
//                                     AND hospital_type_id IN (5, 6, 7, 11, 12, 13)
//
// Codes follow MOPH convention:
//   province_code = 2 digits (chwpart)
//   district_code = 4 digits (chwpart + amppart)
//   tambol_code   = 6 digits (chwpart + amppart + tmbpart)
//   hospcode      = 5 digits (MOPH facility code)
//
// hospital_type_id → level (per MOPH classification):
//   5  = A/S  (general / regional)
//   6  = M1   (large referral community)
//   7  = M2/F1/F2 (community — bed_count distinguishes sub-levels)
//   11, 12, 13 = F3 / health-promoting / sub-district facilities
//
// Size warning: tambons.json (~1.0 MB) and hospitals.json (~0.65 MB) ship
// as static JSON. Do not import the full file on the client unless rendering
// a picker — prefer server-side filtering by province/district first.

import provincesJson from './provinces.json';
import districtsJson from './districts.json';
import tambonsJson from './tambons.json';
import hospitalsJson from './hospitals.json';

export interface ThaiProvince {
  province_code: string;
  province_name: string;
}

export interface ThaiDistrict {
  district_code: string;
  district_name: string;
  province_code: string;
}

export interface ThaiTambon {
  tambol_code: string;
  tambol_name: string;
  district_code: string;
}

export interface MophHospital {
  hospcode: string;
  name: string;
  hosptype: string | null;
  hospital_type_id: number | null;
  hospital_level_id: number | null;
  bed_count: number | null;
  chwpart: string | null;
  amppart: string | null;
  tmbpart: string | null;
  addrpart: string | null;
  hospital_phone: string | null;
  active_status: string | null;
}

export const THAI_PROVINCES: readonly ThaiProvince[] = provincesJson as ThaiProvince[];
export const THAI_DISTRICTS: readonly ThaiDistrict[] = districtsJson as ThaiDistrict[];
export const THAI_TAMBONS: readonly ThaiTambon[] = tambonsJson as ThaiTambon[];
export const MOPH_HOSPITALS: readonly MophHospital[] = hospitalsJson as MophHospital[];

export function getProvinceByCode(code: string): ThaiProvince | undefined {
  return THAI_PROVINCES.find((p) => p.province_code === code);
}

export function getDistrictsByProvince(provinceCode: string): ThaiDistrict[] {
  return THAI_DISTRICTS.filter((d) => d.province_code === provinceCode);
}

export function getTambonsByDistrict(districtCode: string): ThaiTambon[] {
  return THAI_TAMBONS.filter((t) => t.district_code === districtCode);
}

export function getHospitalsByProvince(provinceCode: string): MophHospital[] {
  return MOPH_HOSPITALS.filter((h) => h.chwpart === provinceCode);
}
