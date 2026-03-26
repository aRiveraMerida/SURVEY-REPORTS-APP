// ============================================
// Emitter Settings (empresa emisora)
// ============================================
export interface EmitterSettings {
  id: string;
  company_name: string;
  logo_url: string | null;
  footer_phones: string[];
  footer_emails: string[];
  footer_web: string | null;
  footer_linkedin: string | null;
  footer_addresses: string[];
  smtp_host: string | null;
  smtp_port: number;
  smtp_user: string | null;
  smtp_pass: string | null;
  smtp_from: string | null;
  updated_at: string;
}

// ============================================
// Client (empresa destinataria del informe)
// ============================================
export interface Client {
  id: string;
  name: string;
  logo_url: string | null;
  notes: string | null;
  contact_emails: string[];
  file_password: string | null;
  created_at: string;
  created_by: string;
}

// ============================================
// Report
// ============================================
export interface Report {
  id: string;
  client_id: string;
  title: string;
  period: string;
  report_type: 'charts' | 'table' | 'flowchart';
  ai_analysis: AIAnalysis;
  report_html: string;
  report_data: ProcessedData;
  created_at: string;
  created_by: string;
}

export interface ReportWithClient extends Report {
  client_name: string;
  client_logo_url: string | null;
}

// ============================================
// AI Analysis — output estructurado de Claude
// ============================================
export interface AIAnalysis {
  summary: string;
  dataType: string;
  resultColumn?: string;
  funnel?: AIFunnelConfig | null;
  questions: AIQuestionConfig[];
  tableRows: AITableRow[];
  flowchartPages: AIFlowchartPage[];
}

export interface AIFunnelConfig {
  totalLabel: string;
  notContacted: { label: string; values: string[] };
  contactedNotInformed: { label: string; values: string[] };
  informed: { label: string; values: string[] };
}

export interface AIQuestionConfig {
  id: string;
  columnLetter: string;
  questionText: string;
  chartType: 'pie' | 'doughnut' | 'bar' | 'horizontalBar';
  rationale: string;
  enabled: boolean;
  filterColumn?: string;
  filterValues?: string[];
}

export interface AITableRow {
  label: string;
  source: string;
  percentOf?: string;
  level: number;
  bold?: boolean;
  highlight?: boolean;
}

export interface AIFlowchartPage {
  id: string;
  title: string;
  nodes: AIFlowchartNode[];
}

export interface AIFlowchartNode {
  id: string;
  label: string;
  source: string;
  percentOf?: string;
  level: number;
  children?: string[];
}

// ============================================
// Access Log
// ============================================
export interface AccessLog {
  id: string;
  user_id: string;
  user_email: string;
  action: string;
  path: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ============================================
// Report Style
// ============================================
export interface ReportStyle {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  headerGradient: [string, string];
  fontFamily: string;
  questionNumberColor: string;
  chartColors: string[];
  pageSize: 'A4' | 'Letter';
  orientation: 'landscape' | 'portrait';
}

// ============================================
// Processed Data (stored in report_data)
// ============================================
export interface ProcessedData {
  totalRows: number;
  funnel: FunnelData;
  questions: ProcessedQuestion[];
}

export interface FunnelData {
  total: number;
  notContacted: { total: number; breakdown: Record<string, number> };
  contactedNotInformed: { total: number; breakdown: Record<string, number> };
  informed: { total: number; breakdown: Record<string, number> };
  contacted: number;
}

export interface ProcessedQuestion {
  id: string;
  questionText: string;
  chartType: 'pie' | 'doughnut' | 'bar' | 'horizontalBar';
  total: number;
  frequencies: Record<string, number>;
  percentages: Record<string, string>;
  order: number;
}
