import type { DashboardData, FiscalProfile } from "@/types";
import type { TftAssumptions, TftSettings } from "@/lib/tft/types";
import { getSupabaseBrowserClient, getSupabaseUserId } from "./client";

type SerializedDashboardData = Omit<
  DashboardData,
  "transactions" | "lastTransactionDate" | "recurringCharges" | "deadlines"
> & {
  transactions: Array<Omit<DashboardData["transactions"][number], "date"> & { date: string }>;
  lastTransactionDate: string;
  recurringCharges: Array<Omit<DashboardData["recurringCharges"][number], "lastSeen"> & { lastSeen: string }>;
  deadlines: Array<Omit<DashboardData["deadlines"][number], "date"> & { date: string }>;
};

export function serializeDashboardData(data: DashboardData): SerializedDashboardData {
  return {
    ...data,
    transactions: data.transactions.map((transaction) => ({
      ...transaction,
      date: transaction.date.toISOString(),
    })),
    lastTransactionDate: data.lastTransactionDate.toISOString(),
    recurringCharges: data.recurringCharges.map((charge) => ({
      ...charge,
      lastSeen: charge.lastSeen.toISOString(),
    })),
    deadlines: data.deadlines.map((deadline) => ({
      ...deadline,
      date: deadline.date.toISOString(),
    })),
  };
}

export function hydrateDashboardData(payload: SerializedDashboardData): DashboardData {
  return {
    ...payload,
    transactions: payload.transactions.map((transaction) => ({
      ...transaction,
      date: new Date(transaction.date),
    })),
    lastTransactionDate: new Date(payload.lastTransactionDate),
    recurringCharges: (payload.recurringCharges ?? []).map((charge) => ({
      ...charge,
      lastSeen: new Date(charge.lastSeen),
    })),
    deadlines: (payload.deadlines ?? []).map((deadline) => ({
      ...deadline,
      date: new Date(deadline.date),
    })),
    recommendations: payload.recommendations ?? [],
    monthlyRecurring: payload.monthlyRecurring ?? 0,
  };
}

export async function loadRemoteDashboardState(): Promise<{
  dashboard: DashboardData | null;
  fiscalProfile: FiscalProfile | null;
} | null> {
  const supabase = getSupabaseBrowserClient();
  const userId = await getSupabaseUserId();
  if (!supabase || !userId) return null;

  const { data, error } = await supabase
    .from("dashboard_states")
    .select("data,fiscal_profile")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return { dashboard: null, fiscalProfile: null };

  return {
    dashboard: data.data ? hydrateDashboardData(data.data as SerializedDashboardData) : null,
    fiscalProfile: (data.fiscal_profile as FiscalProfile | null) ?? null,
  };
}

export async function saveRemoteDashboardState(
  dashboard: DashboardData,
  fiscalProfile: FiscalProfile | null
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const userId = await getSupabaseUserId();
  if (!supabase || !userId) return;

  await supabase.from("dashboard_states").upsert({
    user_id: userId,
    data: serializeDashboardData(dashboard),
    fiscal_profile: fiscalProfile,
    updated_at: new Date().toISOString(),
  });
}

export async function saveRemoteFiscalProfile(fiscalProfile: FiscalProfile): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const userId = await getSupabaseUserId();
  if (!supabase || !userId) return;

  await supabase.from("dashboard_states").upsert({
    user_id: userId,
    fiscal_profile: fiscalProfile,
    updated_at: new Date().toISOString(),
  });
}

export async function loadRemoteTftState(): Promise<{
  settings: TftSettings;
  assumptions: TftAssumptions;
} | null> {
  const supabase = getSupabaseBrowserClient();
  const userId = await getSupabaseUserId();
  if (!supabase || !userId) return null;

  const { data, error } = await supabase
    .from("tft_states")
    .select("settings,assumptions")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.settings || !data?.assumptions) return null;

  return {
    settings: data.settings as TftSettings,
    assumptions: data.assumptions as TftAssumptions,
  };
}

export async function saveRemoteTftState(
  settings: TftSettings,
  assumptions: TftAssumptions
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const userId = await getSupabaseUserId();
  if (!supabase || !userId) return;

  await supabase.from("tft_states").upsert({
    user_id: userId,
    settings,
    assumptions,
    updated_at: new Date().toISOString(),
  });
}
