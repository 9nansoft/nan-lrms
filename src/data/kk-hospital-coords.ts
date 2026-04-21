// Real hospital coordinates for the Khon Kaen LR network.
// Source: OpenStreetMap Overpass API (ISO3166-2:TH-40, amenity=hospital)
// Queried 2026-04-21. 21/26 hospitals have accurate OSM lat/lon; 5 use
// district-centroid fallback (hospital not tagged on OSM). Upgrade those
// by looking them up on https://nominatim.openstreetmap.org/ and editing
// the 'district-centroid' → 'osm' once verified.

export interface HospitalCoord {
  lat: number;
  lon: number;
  source: 'osm' | 'district-centroid';
  name: string;
}

export const HOSPITAL_COORDS: Record<string, HospitalCoord> = {
  "10670": { lat: 16.43056, lon: 102.84881, source: 'osm', name: 'รพ.ขอนแก่น' },
  "10995": { lat: 16.44919, lon: 102.65433, source: 'osm', name: 'รพ.บ้านฝาง' },
  "10996": { lat: 16.30367, lon: 102.66794, source: 'district-centroid', name: 'รพ.พระยืน' },
  "10997": { lat: 16.49096, lon: 102.44342, source: 'osm', name: 'รพ.หนองเรือ' },
  "10998": { lat: 16.54569, lon: 102.09991, source: 'osm', name: 'รพ.ชุมแพ' },
  "10999": { lat: 16.79774, lon: 102.18779, source: 'osm', name: 'รพ.สีชมพู' },
  "11000": { lat: 16.7293, lon: 102.8017, source: 'osm', name: 'รพ.น้ำพอง' },
  "11001": { lat: 16.75657, lon: 102.63274, source: 'osm', name: 'รพ.อุบลรัตน์' },
  "11002": { lat: 16.10294, lon: 102.74426, source: 'osm', name: 'รพ.บ้านไผ่' },
  "11003": { lat: 15.87883, lon: 102.91081, source: 'osm', name: 'รพ.เปือยน้อย' },
  "11004": { lat: 15.8163, lon: 102.60892, source: 'osm', name: 'รพ.พล' },
  "11005": { lat: 15.93993, lon: 102.53285, source: 'osm', name: 'รพ.แวงใหญ่' },
  "11006": { lat: 15.81399, lon: 102.39038, source: 'osm', name: 'รพ.แวงน้อย' },
  "11007": { lat: 15.73365, lon: 102.79474, source: 'osm', name: 'รพ.หนองสองห้อง' },
  "11008": { lat: 16.65179, lon: 102.37988, source: 'osm', name: 'รพ.ภูเวียง' },
  "11009": { lat: 16.13478, lon: 102.53412, source: 'osm', name: 'รพ.มัญจาคีรี' },
  "11010": { lat: 16.09155, lon: 102.61886, source: 'osm', name: 'รพ.ชนบท' },
  "11011": { lat: 16.85117, lon: 102.85634, source: 'osm', name: 'รพ.เขาสวนกวาง' },
  "11012": { lat: 16.64603, lon: 101.90233, source: 'osm', name: 'รพ.ภูผาม่าน' },
  "11445": { lat: 16.70627, lon: 103.08521, source: 'osm', name: 'รพ.กระนวน (สมเด็จพระยุพราช)' },
  "12275": { lat: 16.25069, lon: 102.77217, source: 'osm', name: 'รพ.สิรินธร' },
  "14132": { lat: 16.53849, lon: 103.07594, source: 'osm', name: 'รพ.ซำสูง' },
  "77649": { lat: 16.83643, lon: 102.32161, source: 'district-centroid', name: 'รพ.หนองนาคำ' },
  "77650": { lat: 16.70068, lon: 102.25491, source: 'district-centroid', name: 'รพ.เวียงเก่า' },
  "77651": { lat: 16.04508, lon: 102.39771, source: 'district-centroid', name: 'รพ.โคกโพธิ์ไชย' },
  "77652": { lat: 15.9728, lon: 102.68306, source: 'district-centroid', name: 'รพ.โนนศิลา' },
};
