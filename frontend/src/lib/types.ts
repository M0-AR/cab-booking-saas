export type Role = "owner" | "admin" | "manager" | "driver" | "viewer";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  plan: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
  tenant: Tenant;
}

export interface MeOut {
  user: User;
  tenant: Tenant;
  features: Features;
}

export interface Features {
  reports?: boolean;
  api_access?: boolean;
  custom_domain?: boolean;
  max_cabs?: number;
  max_users?: number;
  [key: string]: unknown;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type BookingStatus = "pending" | "assigned" | "completed" | "cancelled";
export type DriverStatus = "active" | "inactive" | "on_trip";
export type CabStatus = "available" | "busy" | "maintenance";

export interface Driver {
  id: string;
  name: string;
  phone: string;
  license_no: string | null;
  license_expiry: string | null;
  status: DriverStatus;
  created_at: string;
}

export interface Cab {
  id: string;
  model: string;
  plate: string;
  capacity: number;
  status: CabStatus;
  driver_id: string | null;
  insurance_expiry: string | null;
  registration_expiry: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  created_at: string;
}

export interface Booking {
  id: string;
  customer: Customer;
  driver: Driver | null;
  cab: Cab | null;
  pickup: string;
  dropoff: string;
  scheduled_at: string;
  status: BookingStatus;
  fare: string | null;
  notes: string | null;
  created_at: string;
}

export interface Brand {
  display_name: string | null;
  primary_color: string | null;
  accent_color: string | null;
  logo_url: string | null;
}

export interface FareConfig {
  base: number;
  per_km: number;
  per_min: number;
  currency: string;
}

export interface SettingsOut {
  currency: string;
  timezone: string;
  brand: Brand;
  features: Features;
  fare: FareConfig;
}

export interface PublicBranding {
  tenant_name: string;
  tenant_slug: string;
  display_name: string | null;
  primary_color: string | null;
  accent_color: string | null;
  logo_url: string | null;
  currency: string;
}

export interface DailyPoint {
  day: string;
  bookings: number;
  revenue: string;
}

export interface TopDriver {
  driver_id: string;
  name: string;
  completed: number;
}

export interface ReportSummary {
  total_bookings: number;
  by_status: Record<string, number>;
  revenue: string;
  avg_fare: string | null;
  daily: DailyPoint[];
  top_drivers: TopDriver[];
}

export interface SearchHit {
  id: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
}

export interface SearchResults {
  bookings: SearchHit[];
  customers: SearchHit[];
  drivers: SearchHit[];
  cabs: SearchHit[];
}

export interface ActivityItem {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  meta: Record<string, unknown>;
  user_id: string | null;
  user_name: string | null;
  created_at: string;
}

export interface AttentionBooking {
  id: string;
  customer_name: string;
  customer_phone: string;
  pickup: string;
  dropoff: string;
  scheduled_at: string;
  status: string;
}

export interface AttentionExpiry {
  entity: "driver" | "cab";
  entity_id: string;
  label: string;
  kind: "license" | "insurance" | "registration";
  expires_on: string;
  days_left: number;
}

export interface AttentionOut {
  unassigned_count: number;
  unassigned: AttentionBooking[];
  overdue_count: number;
  overdue: AttentionBooking[];
  expiring: AttentionExpiry[];
}
