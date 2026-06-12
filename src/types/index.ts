export type LocationPoint = {
  latitude: number;
  longitude: number;
};

export type PersonalData = {
  fullName: string;
  idNumber: string;
  email: string;
  phone: string;
};

export type ResponseMedium = 'cartelera' | 'correo_electronico' | 'correo_fisico';
export type SubmitStageStatus = 'pending' | 'active' | 'done';

export type TrackingEvent = {
  to_status: string;
  reason: string | null;
  detail: string | null;
  created_at: string;
};

export type TrackingSnapshot = {
  trackingCode: string;
  status: string;
  consecutivoOficial?: string | null;
  radicadoOficial?: string | null;
  portalMessage?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
  events: TrackingEvent[];
};

export type AppNoticeState = {
  visible: boolean;
  title: string;
  message: string;
  tone: 'info' | 'success' | 'error';
};
