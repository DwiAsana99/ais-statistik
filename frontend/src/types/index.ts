export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
  label?: string;
}

export interface DashboardOverview {
  total_vessels: number;
  active_vessels: number;
  vessels_underway: number;
  vessels_anchored: number;
  vessels_moored: number;
  total_ship_types: number;
  messages_today: number;
  stations_online: number;
  error_rate: number;
}

export interface TrafficKpis {
  total_active_vessels_7d: number;
  sog_median_knots: number;
  peak_hour: number;
}

export interface VesselKpis {
  unique_ship_types: number;
  largest_vessel_loa: number | null;
  dominant_flag: string | null;
}

export interface SogBin {
  bin_start: number;
  count: number;
}

export interface SearchResult {
  type: string;
  mmsi: number;
  name: string | null;
  description: string | null;
}

export interface DistributionResponse {
  title: string;
  data: ChartDataPoint[];
  total: number;
}

export interface TrendResponse {
  title: string;
  data: TimeSeriesPoint[];
  period: string;
}

export interface VesselListItem {
  mmsi: number;
  name: string | null;
  call_sign: string | null;
  imo: number | null;
  ship_type_code: number | null;
  ship_type_group: string | null;
  length_m: number | null;
  width_m: number | null;
  draught_m: number | null;
  destination: string | null;
  last_lat: number | null;
  last_lon: number | null;
  last_sog: number | null;
  last_nav_status: string | null;
  last_update: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface StationStats {
  station_id: string;
  station_name: string | null;
  vessel_count: number;
  message_count: number | null;
}

export interface GeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: Record<string, unknown>;
}

export interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

export interface EncounterSummary {
  id: string;
  mmsi_a: number;
  mmsi_b: number;
  name_a: string | null;
  name_b: string | null;
  ship_type_a: string | null;
  ship_type_b: string | null;
  first_seen: string;
  last_seen: string;
  duration_minutes: number;
  sample_count: number;
  min_distance_m: number;
  avg_lat: number;
  avg_lon: number;
}

export interface EncounterTrackPoint {
  time: string;
  lat_a: number;
  lon_a: number;
  lat_b: number;
  lon_b: number;
  distance_m: number;
}

export interface EncounterDetail extends EncounterSummary {
  track: EncounterTrackPoint[];
}

export interface EncounterListResponse {
  items: EncounterSummary[];
  total: number;
  date_from: string;
  date_to: string;
  distance_m: number;
}

export interface MessageSummary {
  total_messages: number;
  avg_per_vessel: number;
  unique_msg_types: number;
  class_a_pct: number;
  class_b_pct: number;
  throughput_per_hour: number;
}

export interface MessageTypeBreakdown {
  msg_type: number;
  type_name: string | null;
  count: number;
  pct: number;
}

export interface StationPerformance {
  station_id: string;
  station_name: string | null;
  mmsi: number | null;
  lat: number | null;
  lon: number | null;
  vessel_count: number;
  msg_per_hour: number;
  last_seen: string | null;
  status: "online" | "degraded" | "offline" | "unknown";
}

export interface StationKpis {
  total_stations: number;
  online_count: number;
  degraded_count: number;
  offline_count: number;
  total_vessel_coverage: number;
  total_throughput_per_hour: number;
}

export interface QualitySummary {
  error_rate_pct: number;
  total_errors: number;
  total_messages: number;
  parse_error_count: number;
  duplicate_count: number;
  invalid_mmsi_count: number;
  status: "healthy" | "warning" | "critical";
}

export interface QualityByStation {
  station_id: string;
  error_count: number;
  total_count: number;
  error_rate_pct: number;
  severity: "ok" | "warning" | "critical";
}

export interface LoiteringEvent {
  id: string;
  mmsi: number;
  vessel_name: string | null;
  ship_type: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  centroid_lat: number;
  centroid_lon: number;
  avg_sog: number;
  point_count: number;
  avg_dist_port_km: number;
}

export interface LoiteringTrackPoint {
  time: string;
  lat: number;
  lon: number;
  sog: number;
}

export interface LoiteringDetail extends LoiteringEvent {
  track: LoiteringTrackPoint[];
}

export interface LoiteringListResponse {
  items: LoiteringEvent[];
  total: number;
  date_from: string;
  date_to: string;
}

export interface AnomalyA0Summary {
  total_mmsi_registered: number;
  mmsi_invalid_count: number;
  mmsi_placeholder_count: number;
  n_vessels_active: number;
  lookback_days: number;
  n_points_total: number;
  n_sog_na: number;
  n_cog_na: number;
  n_latlon_bad: number;
}

export interface AnomalyEvent {
  id: number;
  mmsi: number;
  vessel_name: string | null;
  ship_type: string | null;
  type: string;
  detector: string;
  t_start: string;
  t_end: string | null;
  lat: number | null;
  lon: number | null;
  score: number | null;
  severity: string;
  status: string;
  evidence: Record<string, number | string>;
}

export interface AnomalyEventsResponse {
  items: AnomalyEvent[];
  total: number;
}

export interface AnomalyTypeCount {
  type: string;
  count: number;
}

export interface AnomalySummary {
  total_events: number;
  by_type: AnomalyTypeCount[];
  last_run_at: string | null;
}

export interface VesselTrackPoint {
  time: string;
  lat: number;
  lon: number;
  sog: number | null;
  cog: number | null;
  heading: number | null;
  nav_status_code: number | null;
}

export interface MonthlyReport {
  year: number;
  month: number;
  month_label: string;
  total_messages: number;
  total_vessels: number;
  active_days: number;
  avg_error_rate: number;
  msg_change_pct: number | null;
}

export interface WeeklyBreakdown {
  week_num: number;
  messages: number;
  vessels: number;
}

export interface MonthlyReportDetail extends MonthlyReport {
  total_errors: number;
  weekly_breakdown: WeeklyBreakdown[];
  top_ship_types: ChartDataPoint[];
  top_stations: ChartDataPoint[];
}
