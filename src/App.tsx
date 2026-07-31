import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  BarChart,
  Bar
} from 'recharts';
import {
  Truck,
  Plus,
  X,
  TrendingUp,
  TrendingDown,
  Calendar,
  Filter,
  CheckCircle2,
  Clock,
  CreditCard,
  Fuel,
  Wrench,
  Users,
  FileText,
  PieChart,
  BarChart3,
  ChevronRight,
  Trash2,
  Edit2,
  AlertTriangle,
  Download,
  Upload,
  RotateCcw,
  Check,
  Zap,
  Settings,
  DollarSign,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Layers,
  Search,
  Briefcase,
  Database,
  Printer,
  Lock,
  LogOut,
  KeyRound,
  User,
  Shield,
  Calculator,
  Tag
} from 'lucide-react';
import { LoginPage } from './components/LoginPage';
import {
  supabase,
  SUPABASE_PROJECT_ID,
  SUPABASE_PROJECT_URL,
  checkSupabaseConnection,
  loadStateFromSupabase,
  saveStateToSupabase,
  SUPABASE_SQL_SCRIPT
} from './lib/supabase';
import { generateAccountingPDF } from './utils/pdfExport';

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface Collaborator {
  id: string;
  userId?: string;
  name: string;
  phone?: string;
  defaultRate?: number;
  notes?: string;
}

export interface CollabTrip {
  id: string;
  userId?: string;
  date: string; // YYYY-MM-DD
  shift: 'Day' | 'Night' | 'Full';
  collaboratorId?: string;
  collaboratorName?: string;
  tripsCount: number;
  ratePerTrip: number;
  totalAmount: number;
  fuelExpense: number;
  driverPay: number;
  settled: boolean;
  notes: string;
  loadingPoint?: string;
  unloadingPoint?: string;
  timestamp: number;
}

export interface PrivateTrip {
  id: string;
  userId?: string;
  date: string; // YYYY-MM-DD
  customerName: string;
  tripsCount: number;
  ratePerTrip: number;
  totalAmount: number;
  paymentStatus: 'Cash' | 'UPI' | 'Pending Credit';
  extraFuelCost: number;
  notes: string;
  timestamp: number;
}

export interface Expense {
  id: string;
  userId?: string;
  date: string; // YYYY-MM-DD
  category: 'Fuel' | 'Driver Pay' | 'Toll' | 'Servicing/Parts' | 'Misc';
  amount: number;
  notes: string;
  timestamp: number;
}

export interface PaymentReceived {
  id: string;
  userId?: string;
  date: string; // YYYY-MM-DD
  collaboratorId?: string;
  collaboratorName?: string;
  amount: number;
  referenceNote: string;
  timestamp: number;
}

export interface AppSettings {
  currencySymbol: string;
  defaultCollabRate: number;
  vehicleRegNo: string;
  ownerName: string;
}

export interface AppData {
  collaborators: Collaborator[];
  collabTrips: CollabTrip[];
  privateTrips: PrivateTrip[];
  expenses: Expense[];
  paymentsReceived: PaymentReceived[];
  settings: AppSettings;
}

// ==========================================
// INITIAL MOCK DATA PERSISTENCE
// ==========================================

const PRIMARY_STORAGE_KEY = 'tipperlog_data_v2';
const FALLBACK_STORAGE_KEY = 'tipperlog_app_data';

const getTodayString = (offsetDays = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const defaultCollaborators: Collaborator[] = [];

const getInitialData = (): AppData => {
  return {
    settings: {
      currencySymbol: '₹',
      defaultCollabRate: 600,
      vehicleRegNo: '',
      ownerName: ''
    },
    collaborators: [],
    collabTrips: [],
    privateTrips: [],
    expenses: [],
    paymentsReceived: []
  };
};

/**
 * Merge local and remote data to ensure no user records are lost when syncing or updating
 */
const mergeAppData = (local: AppData, remote: any): AppData => {
  if (!remote || typeof remote !== 'object') return local;

  const mergeByUniqueId = <T extends { id: string }>(localArr: T[] = [], remoteArr: T[] = []): T[] => {
    const map = new Map<string, T>();
    (localArr || []).forEach((item) => {
      if (item && item.id) map.set(item.id, item);
    });
    (remoteArr || []).forEach((item) => {
      if (item && item.id) {
        if (!map.has(item.id)) {
          map.set(item.id, item);
        } else {
          map.set(item.id, { ...map.get(item.id)!, ...item });
        }
      }
    });
    return Array.from(map.values());
  };

  return {
    settings: {
      currencySymbol: '₹',
      defaultCollabRate: remote.settings?.defaultCollabRate ?? local.settings?.defaultCollabRate ?? 600,
      vehicleRegNo: remote.settings?.vehicleRegNo || local.settings?.vehicleRegNo || '',
      ownerName: remote.settings?.ownerName || local.settings?.ownerName || ''
    },
    collaborators: mergeByUniqueId(local.collaborators, remote.collaborators),
    collabTrips: mergeByUniqueId(local.collabTrips, remote.collabTrips),
    privateTrips: mergeByUniqueId(local.privateTrips, remote.privateTrips),
    expenses: mergeByUniqueId(local.expenses, remote.expenses),
    paymentsReceived: mergeByUniqueId(local.paymentsReceived, remote.paymentsReceived)
  };
};

// Helper Formatters
const formatCurrency = (val: number, symbol = '₹') => {
  const num = Number(val) || 0;
  return `${symbol}${num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatDateReadable = (dateStr: string) => {
  if (!dateStr) return '';
  const today = getTodayString(0);
  const yesterday = getTodayString(1);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return dateStr;
};

// ==========================================
// MAIN TIPPERLOG COMPONENT
// ==========================================

export default function App() {
  // User profile state
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(() => {
    try {
      const stored = localStorage.getItem('tipperlog_user_profile') || sessionStorage.getItem('tipperlog_user_profile');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const currentUserId = currentUserProfile?.userId || (currentUserProfile?.email ? `usr_${currentUserProfile.email.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : undefined);

  // App Persistent State
  const [data, setData] = useState<AppData>(() => {
    try {
      const profile = (() => {
        try {
          const s = localStorage.getItem('tipperlog_user_profile') || sessionStorage.getItem('tipperlog_user_profile');
          return s ? JSON.parse(s) : null;
        } catch { return null; }
      })();
      const uid = profile?.userId || (profile?.email ? `usr_${profile.email.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : undefined);
      const userKey = uid ? `tipperlog_data_v2_${uid}` : PRIMARY_STORAGE_KEY;

      const savedUser = localStorage.getItem(userKey);
      const savedV2 = localStorage.getItem(PRIMARY_STORAGE_KEY);
      const savedV1 = localStorage.getItem(FALLBACK_STORAGE_KEY);
      const saved = savedUser || savedV2 || savedV1;
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.settings && parsed.settings.currencySymbol === '$') {
          parsed.settings.currencySymbol = '₹';
        }
        return {
          settings: {
            currencySymbol: '₹',
            defaultCollabRate: 600,
            vehicleRegNo: '',
            ownerName: '',
            ...(parsed.settings || {})
          },
          collaborators: Array.isArray(parsed.collaborators) ? parsed.collaborators : [],
          collabTrips: Array.isArray(parsed.collabTrips) ? parsed.collabTrips : [],
          privateTrips: Array.isArray(parsed.privateTrips) ? parsed.privateTrips : [],
          expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
          paymentsReceived: Array.isArray(parsed.paymentsReceived) ? parsed.paymentsReceived : []
        };
      }
    } catch (e) {
      console.error('Failed to load local storage data', e);
    }
    return getInitialData();
  });

  // Active Tab View: 'dashboard' | 'logs' | 'ledger' | 'analytics'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs' | 'ledger' | 'analytics'>('dashboard');

  // Date Filter State for Dashboard / Global
  const [selectedDateFilter, setSelectedDateFilter] = useState<'today' | 'this_week' | 'this_month' | 'all'>('today');

  // FAB Speed Dial Toggle
  const [isFabOpen, setIsFabOpen] = useState(false);

  // Active Modal Controls
  const [activeModal, setActiveModal] = useState<'collab' | 'private' | 'expense' | 'payment' | 'settings' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Quick Add / Edit Collaborator Modal State
  const [showAddCollabModal, setShowAddCollabModal] = useState(false);
  const [editingCollabId, setEditingCollabId] = useState<string | null>(null);
  const [newCollabForm, setNewCollabForm] = useState<{
    name: string;
    phone: string;
    defaultRate: number | string;
    notes: string;
  }>({
    name: '',
    phone: '',
    defaultRate: 600,
    notes: ''
  });

  // Ledger Filter for specific collaborator
  const [selectedLedgerCollabId, setSelectedLedgerCollabId] = useState<string>('all');

  // Search query for logs
  const [searchQuery, setSearchQuery] = useState('');
  const [logsCategory, setLogsCategory] = useState<'all' | 'collab' | 'private' | 'expense'>('all');
  const [expenseChartType, setExpenseChartType] = useState<'bar' | 'pie'>('bar');

  // Settings & Admin Section States
  const [settingsTab, setSettingsTab] = useState<'menu' | 'general' | 'pending_rates' | 'admin'>('menu');
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [adminCategoryFilter, setAdminCategoryFilter] = useState<'all' | 'collab' | 'private' | 'expense' | 'payment'>('all');

  // Pending Rates Manager States & Helpers
  const [pendingRatesSelectedDate, setPendingRatesSelectedDate] = useState<string>('');
  const [pendingRateInputs, setPendingRateInputs] = useState<Record<string, number | string>>({});

  const unpricedCollabTrips = useMemo(() => {
    return (data.collabTrips || []).filter((t) => Number(t.ratePerTrip || 0) === 0);
  }, [data.collabTrips]);

  const unpricedPrivateTrips = useMemo(() => {
    return (data.privateTrips || []).filter((t) => Number(t.ratePerTrip || 0) === 0);
  }, [data.privateTrips]);

  const totalUnpricedTripsCount = unpricedCollabTrips.length + unpricedPrivateTrips.length;

  // Dates containing unpriced trips sorted descending
  const pendingRateDates = useMemo(() => {
    const datesSet = new Set<string>();
    unpricedCollabTrips.forEach((t) => t.date && datesSet.add(t.date));
    unpricedPrivateTrips.forEach((t) => t.date && datesSet.add(t.date));
    return Array.from(datesSet).sort((a, b) => b.localeCompare(a));
  }, [unpricedCollabTrips, unpricedPrivateTrips]);

  // Default selected date to latest date with pending rates when tab or modal changes
  useEffect(() => {
    if (activeModal === 'settings' && settingsTab === 'pending_rates') {
      if (!pendingRatesSelectedDate || !pendingRateDates.includes(pendingRatesSelectedDate)) {
        setPendingRatesSelectedDate(pendingRateDates[0] || getTodayString(0));
      }
    }
  }, [activeModal, settingsTab, pendingRateDates, pendingRatesSelectedDate]);

  // Group unpriced trips for the selected date by route & collaborator/client
  const pendingRouteGroups = useMemo(() => {
    if (!pendingRatesSelectedDate) return [];

    const groupMap = new Map<
      string,
      {
        key: string;
        loadingPoint: string;
        unloadingPoint: string;
        clientName: string;
        type: 'collab' | 'private';
        tripsCount: number;
        tripIds: string[];
        recordsCount: number;
      }
    >();

    // Collab trips on selected date with rate 0
    (data.collabTrips || [])
      .filter((t) => t.date === pendingRatesSelectedDate && Number(t.ratePerTrip || 0) === 0)
      .forEach((t) => {
        const loadingPoint = (t.loadingPoint || '').trim() || 'Loading Site';
        const unloadingPoint = (t.unloadingPoint || '').trim() || 'Unloading Site';
        const clientName = t.collaboratorName || 'Collaborator';
        const key = `collab_${clientName}_${loadingPoint}_${unloadingPoint}`;

        if (!groupMap.has(key)) {
          groupMap.set(key, {
            key,
            loadingPoint,
            unloadingPoint,
            clientName,
            type: 'collab',
            tripsCount: Number(t.tripsCount) || 0,
            tripIds: [t.id],
            recordsCount: 1
          });
        } else {
          const existing = groupMap.get(key)!;
          existing.tripsCount += Number(t.tripsCount) || 0;
          existing.tripIds.push(t.id);
          existing.recordsCount += 1;
        }
      });

    // Private trips on selected date with rate 0
    (data.privateTrips || [])
      .filter((t) => t.date === pendingRatesSelectedDate && Number(t.ratePerTrip || 0) === 0)
      .forEach((t) => {
        const loadingPoint = 'Direct Load';
        const unloadingPoint = 'Client Site';
        const clientName = (t.customerName || '').trim() || 'Private Client';
        const key = `private_${clientName}_${loadingPoint}_${unloadingPoint}`;

        if (!groupMap.has(key)) {
          groupMap.set(key, {
            key,
            loadingPoint,
            unloadingPoint,
            clientName,
            type: 'private',
            tripsCount: Number(t.tripsCount) || 0,
            tripIds: [t.id],
            recordsCount: 1
          });
        } else {
          const existing = groupMap.get(key)!;
          existing.tripsCount += Number(t.tripsCount) || 0;
          existing.tripIds.push(t.id);
          existing.recordsCount += 1;
        }
      });

    return Array.from(groupMap.values());
  }, [data.collabTrips, data.privateTrips, pendingRatesSelectedDate]);

  // Initialize rate inputs for new route groups if not already specified
  useEffect(() => {
    if (pendingRouteGroups.length > 0) {
      setPendingRateInputs((prev) => {
        const updated = { ...prev };
        pendingRouteGroups.forEach((group) => {
          if (updated[group.key] === undefined || updated[group.key] === '') {
            if (group.type === 'collab') {
              const collabObj = (data.collaborators || []).find((c) => c.name === group.clientName);
              const defRate = collabObj?.defaultRate ?? data.settings.defaultCollabRate ?? 600;
              updated[group.key] = defRate;
            } else {
              updated[group.key] = 600;
            }
          }
        });
        return updated;
      });
    }
  }, [pendingRouteGroups, data.collaborators, data.settings.defaultCollabRate]);

  // Batch Save Handler for Pending Rates
  const handleSavePendingRates = () => {
    if (pendingRouteGroups.length === 0) {
      alert('No pending rates to update for this date.');
      return;
    }

    const rateMap = new Map<string, number>();
    pendingRouteGroups.forEach((group) => {
      const enteredRate = Number(pendingRateInputs[group.key] || 0);
      if (enteredRate > 0) {
        group.tripIds.forEach((id) => {
          rateMap.set(id, enteredRate);
        });
      }
    });

    if (rateMap.size === 0) {
      alert('Please enter a valid rate (₹) for at least one route group.');
      return;
    }

    let updatedRecords = 0;
    let totalUpdatedRevenue = 0;

    setData((prev) => {
      const newCollab = prev.collabTrips.map((ct) => {
        if (rateMap.has(ct.id)) {
          const newRate = rateMap.get(ct.id)!;
          const rev = (Number(ct.tripsCount) || 0) * newRate;
          updatedRecords++;
          totalUpdatedRevenue += rev;
          return {
            ...ct,
            ratePerTrip: newRate,
            totalAmount: rev
          };
        }
        return ct;
      });

      const newPrivate = prev.privateTrips.map((pt) => {
        if (rateMap.has(pt.id)) {
          const newRate = rateMap.get(pt.id)!;
          const rev = (Number(pt.tripsCount) || 0) * newRate;
          updatedRecords++;
          totalUpdatedRevenue += rev;
          return {
            ...pt,
            ratePerTrip: newRate,
            totalAmount: rev
          };
        }
        return pt;
      });

      return {
        ...prev,
        collabTrips: newCollab,
        privateTrips: newPrivate
      };
    });

    setTransactionSuccessModal({
      type: 'collab',
      title: 'Trip Rates Batch Updated!',
      subtitle: `${updatedRecords} Record(s) Priced on ${pendingRatesSelectedDate}`,
      amount: totalUpdatedRevenue,
      date: pendingRatesSelectedDate
    });
  };

  // Supabase Connection & Sync States
  const [supabaseConnected, setSupabaseConnected] = useState<boolean>(true);
  const [supabaseMessage, setSupabaseMessage] = useState<string>('Supabase Connected');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isRemoteFetched, setIsRemoteFetched] = useState<boolean>(false);
  const [showSupabaseModal, setShowSupabaseModal] = useState<boolean>(false);
  const [showPdfReportModal, setShowPdfReportModal] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  // Custom Delete Confirmation Modal State
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    id: string;
    type: 'collab' | 'private' | 'expense' | 'payment' | 'collaborator' | 'clear_all' | 'reset_sample';
    title: string;
    description?: string;
  } | null>(null);

  // Transaction Confirmation Dialog State
  const [transactionSuccessModal, setTransactionSuccessModal] = useState<{
    type: 'collab' | 'private' | 'expense' | 'payment';
    title: string;
    subtitle: string;
    amount: number;
    date: string;
    savedDate?: string;
    savedCustomer?: string;
    savedFuel?: number;
  } | null>(null);

  // Transaction Detail & Total Summary Popup State
  const [selectedTransactionDetail, setSelectedTransactionDetail] = useState<{
    id: string;
    type: 'collab' | 'private' | 'expense' | 'payment';
    title: string;
    subtitle: string;
    amount: number;
    date: string;
    isIncome: boolean;
    settled?: boolean;
    collaboratorName?: string;
    rawObject: any;
  } | null>(null);

  // Authentication & Account State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const isLogged =
      localStorage.getItem('tipperlog_auth_logged_in') === 'true' ||
      sessionStorage.getItem('tipperlog_auth_logged_in') === 'true';
    const profile =
      localStorage.getItem('tipperlog_user_profile') ||
      sessionStorage.getItem('tipperlog_user_profile');
    return isLogged && Boolean(profile);
  });

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // ignore
    }
    localStorage.removeItem('tipperlog_auth_logged_in');
    sessionStorage.removeItem('tipperlog_auth_logged_in');
    localStorage.removeItem('tipperlog_user_profile');
    sessionStorage.removeItem('tipperlog_user_profile');
    setCurrentUserProfile(null);
    setIsAuthenticated(false);
  };

  // Check active Supabase Auth session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const profile = {
          userId: session.user.id,
          email: session.user.email || '',
          fullName: session.user.user_metadata?.full_name || 'Tipper Owner',
          role: session.user.user_metadata?.role || 'Owner',
          vehicleRegNo: session.user.user_metadata?.vehicle_reg || ''
        };
        setCurrentUserProfile(profile);
        localStorage.setItem('tipperlog_auth_logged_in', 'true');
        localStorage.setItem('tipperlog_user_profile', JSON.stringify(profile));
        setIsAuthenticated(true);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const profile = {
          userId: session.user.id,
          email: session.user.email || '',
          fullName: session.user.user_metadata?.full_name || 'Tipper Owner',
          role: session.user.user_metadata?.role || 'Owner',
          vehicleRegNo: session.user.user_metadata?.vehicle_reg || ''
        };
        setCurrentUserProfile(profile);
        localStorage.setItem('tipperlog_auth_logged_in', 'true');
        localStorage.setItem('tipperlog_user_profile', JSON.stringify(profile));
        setIsAuthenticated(true);
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Check Supabase Connection on mount & load initial state from Supabase for current user
  useEffect(() => {
    let active = true;
    checkSupabaseConnection().then((res) => {
      if (active) {
        setSupabaseConnected(res.connected);
        setSupabaseMessage(res.message);
      }
    });

    if (currentUserId && isAuthenticated) {
      setIsRemoteFetched(false);
      loadStateFromSupabase(currentUserId)
        .then((remoteData) => {
          if (active) {
            if (remoteData && typeof remoteData === 'object') {
              setData((currentLocal) => mergeAppData(currentLocal, remoteData));
            }
            setIsRemoteFetched(true);
          }
        })
        .catch((err) => {
          console.warn('Notice loading remote state:', err);
          if (active) setIsRemoteFetched(true);
        });
    } else {
      setIsRemoteFetched(true);
    }

    return () => {
      active = false;
    };
  }, [currentUserId, isAuthenticated]);

  // Save to LocalStorage and Supabase whenever data updates (isolated per user)
  useEffect(() => {
    if (!isAuthenticated || !currentUserId) return;

    const userStorageKey = `tipperlog_data_v2_${currentUserId}`;

    try {
      localStorage.setItem(userStorageKey, JSON.stringify(data));
      localStorage.setItem(PRIMARY_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save to local storage', e);
    }

    // ONLY write to Supabase after initial remote state fetch has finished to avoid overwriting live DB with empty state
    if (supabaseConnected && isRemoteFetched) {
      setIsSyncing(true);
      const timer = setTimeout(() => {
        saveStateToSupabase(data, currentUserId).finally(() => {
          setIsSyncing(false);
        });
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [data, currentUserId, isAuthenticated, supabaseConnected, isRemoteFetched]);

  // Currency helper shortcut
  const sym = data.settings.currencySymbol || '₹';

  // Active Collaborators List Helper
  const collaboratorsList = useMemo(() => {
    return data.collaborators || defaultCollaborators;
  }, [data.collaborators]);

  // ==========================================
  // FORM STATES FOR MODALS
  // ==========================================

  // Collab Form State
  const [collabForm, setCollabForm] = useState<{
    date: string;
    shift: 'Day' | 'Night' | 'Full';
    collaboratorId: string;
    tripsCount: number;
    ratePerTrip: number | string;
    fuelExpense: number;
    driverPay: number;
    notes: string;
    loadingPoint: string;
    unloadingPoint: string;
  }>({
    date: getTodayString(0),
    shift: 'Day' as 'Day' | 'Night' | 'Full',
    collaboratorId: collaboratorsList[0]?.id || 'collab-1',
    tripsCount: 5,
    ratePerTrip: collaboratorsList[0]?.defaultRate !== undefined ? collaboratorsList[0].defaultRate : (data.settings.defaultCollabRate !== undefined ? data.settings.defaultCollabRate : 600),
    fuelExpense: 0,
    driverPay: 0,
    notes: '',
    loadingPoint: 'Kucharam',
    unloadingPoint: ''
  });

  // Private Form State
  const [privateForm, setPrivateForm] = useState({
    date: getTodayString(0),
    customerName: '',
    tripsCount: 2,
    ratePerTrip: 200,
    paymentStatus: 'Cash' as 'Cash' | 'UPI' | 'Pending Credit',
    extraFuelCost: 40,
    notes: ''
  });

  // Expense Form State
  const [expenseForm, setExpenseForm] = useState({
    date: getTodayString(0),
    category: 'Fuel' as 'Fuel' | 'Driver Pay' | 'Toll' | 'Servicing/Parts' | 'Misc',
    amount: 150,
    notes: ''
  });

  // Payment Received Form State
  const [paymentForm, setPaymentForm] = useState({
    date: getTodayString(0),
    collaboratorId: collaboratorsList[0]?.id || 'collab-1',
    amount: 3000,
    referenceNote: ''
  });

  // Settings Form State
  const [settingsForm, setSettingsForm] = useState<AppSettings>(data.settings);

  // Synchronize settings form when opening settings modal
  const handleOpenSettings = (tab: 'menu' | 'general' | 'pending_rates' | 'admin' | any = 'menu') => {
    setSettingsForm(data.settings);
    setSettingsTab(typeof tab === 'string' ? tab : 'menu');
    setActiveModal('settings');
  };

  // ==========================================
  // COMPUTED METRICS & CALCULATIONS
  // ==========================================

  // Date boundary helpers
  const todayStr = getTodayString(0);
  const startOfWeekDate = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const start = new Date(d.setDate(diff));
    const year = start.getFullYear();
    const month = String(start.getMonth() + 1).padStart(2, '0');
    const date = String(start.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  }, []);

  const startOfMonthDate = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  }, []);

  // Filter items by selected date filter
  const isDateInFilter = (itemDate: string, filter: typeof selectedDateFilter) => {
    if (filter === 'all') return true;
    if (filter === 'today') return itemDate === todayStr;
    if (filter === 'this_week') return itemDate >= startOfWeekDate;
    if (filter === 'this_month') return itemDate >= startOfMonthDate;
    return true;
  };

  // Filtered lists for metrics
  const filteredCollabTrips = useMemo(() => {
    return data.collabTrips.filter((item) => isDateInFilter(item.date, selectedDateFilter));
  }, [data.collabTrips, selectedDateFilter]);

  const filteredPrivateTrips = useMemo(() => {
    return data.privateTrips.filter((item) => isDateInFilter(item.date, selectedDateFilter));
  }, [data.privateTrips, selectedDateFilter]);

  const filteredExpenses = useMemo(() => {
    return data.expenses.filter((item) => isDateInFilter(item.date, selectedDateFilter));
  }, [data.expenses, selectedDateFilter]);

  // Per-Collaborator Balances Calculation
  const collaboratorBalances = useMemo(() => {
    const collabs = data.collaborators || defaultCollaborators;
    return collabs.map((collab) => {
      const trips = data.collabTrips.filter(
        (t) => t.collaboratorId === collab.id || (!t.collaboratorId && collab.id === collabs[0]?.id)
      );
      const payments = data.paymentsReceived.filter(
        (p) => p.collaboratorId === collab.id || (!p.collaboratorId && collab.id === collabs[0]?.id)
      );
      const totalEarned = trips.reduce((acc, t) => acc + t.totalAmount, 0);
      const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
      const unsettled = Math.max(0, totalEarned - totalPaid);
      const pendingTripsCount = trips.filter((t) => !t.settled).length;
      const settledTripsCount = trips.filter((t) => t.settled).reduce((acc, t) => acc + t.tripsCount, 0);
      const unsettledTripsCount = trips.filter((t) => !t.settled).reduce((acc, t) => acc + t.tripsCount, 0);
      const totalTripsCount = trips.reduce((acc, t) => acc + t.tripsCount, 0);

      return {
        ...collab,
        totalEarned,
        totalPaid,
        unsettled,
        pendingTripsCount,
        settledTripsCount,
        unsettledTripsCount,
        totalTripsCount,
        trips,
        payments
      };
    });
  }, [data.collaborators, data.collabTrips, data.paymentsReceived]);

  // Overall Totals (All Time)
  const totalCollabEarnedAll = useMemo(() => {
    return data.collabTrips.reduce((acc, curr) => acc + curr.totalAmount, 0);
  }, [data.collabTrips]);

  const totalPaymentsReceivedAll = useMemo(() => {
    return data.paymentsReceived.reduce((acc, curr) => acc + curr.amount, 0);
  }, [data.paymentsReceived]);

  // Unsettled Collaborator Balance
  const unsettledCollabBalance = Math.max(0, totalCollabEarnedAll - totalPaymentsReceivedAll);

  // Unsettled Collab Trips count
  const unsettledTripsCount = useMemo(() => {
    return data.collabTrips.filter((t) => !t.settled).length;
  }, [data.collabTrips]);

  // Filtered Summary Totals
  const filteredSummary = useMemo(() => {
    const collabRev = filteredCollabTrips.reduce((acc, c) => acc + c.totalAmount, 0);
    const collabTripsCount = filteredCollabTrips.reduce((acc, c) => acc + c.tripsCount, 0);

    const privateRev = filteredPrivateTrips.reduce((acc, p) => acc + p.totalAmount, 0);
    const privateTripsCount = filteredPrivateTrips.reduce((acc, p) => acc + p.tripsCount, 0);

    // Direct Collab Fuel & Driver pay entered in collab form
    const collabFuel = filteredCollabTrips.reduce((acc, c) => acc + c.fuelExpense, 0);
    const collabDriver = filteredCollabTrips.reduce((acc, c) => acc + c.driverPay, 0);
    const privateFuel = filteredPrivateTrips.reduce((acc, p) => acc + p.extraFuelCost, 0);

    // General Expenses logged
    const genFuel = filteredExpenses.filter((e) => e.category === 'Fuel').reduce((acc, e) => acc + e.amount, 0);
    const genDriver = filteredExpenses.filter((e) => e.category === 'Driver Pay').reduce((acc, e) => acc + e.amount, 0);
    const genTolls = filteredExpenses.filter((e) => e.category === 'Toll').reduce((acc, e) => acc + e.amount, 0);
    const genServicing = filteredExpenses.filter((e) => e.category === 'Servicing/Parts').reduce((acc, e) => acc + e.amount, 0);
    const genMisc = filteredExpenses.filter((e) => e.category === 'Misc').reduce((acc, e) => acc + e.amount, 0);

    const totalFuel = collabFuel + privateFuel + genFuel;
    const totalDriverPay = collabDriver + genDriver;
    const totalTolls = genTolls;
    const totalServicing = genServicing;
    const totalMisc = genMisc;

    const totalExpenses = totalFuel + totalDriverPay + totalTolls + totalServicing + totalMisc;
    const grossRevenue = collabRev + privateRev;
    const netProfit = grossRevenue - totalExpenses;
    const totalTrips = collabTripsCount + privateTripsCount;
    const avgRevenuePerTrip = totalTrips > 0 ? grossRevenue / totalTrips : 0;
    const fuelCostRatio = grossRevenue > 0 ? (totalFuel / grossRevenue) * 100 : 0;

    return {
      collabRev,
      collabTripsCount,
      privateRev,
      privateTripsCount,
      totalTrips,
      grossRevenue,
      totalExpenses,
      totalFuel,
      totalDriverPay,
      totalTolls,
      totalServicing,
      totalMisc,
      netProfit,
      avgRevenuePerTrip,
      fuelCostRatio
    };
  }, [filteredCollabTrips, filteredPrivateTrips, filteredExpenses]);

  // Chart Data Calculation for Dashboard Graph
  const chartData = useMemo(() => {
    const daysCount = selectedDateFilter === 'today' ? 1 : selectedDateFilter === 'this_week' ? 7 : selectedDateFilter === 'this_month' ? 30 : 14;
    const dateMap: { [dateStr: string]: { date: string; displayDate: string; revenue: number; expenses: number; profit: number; trips: number } } = {};

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = getTodayString(i);
      const display = i === 0 ? 'Today' : i === 1 ? 'Yest' : d.slice(5);
      dateMap[d] = {
        date: d,
        displayDate: display,
        revenue: 0,
        expenses: 0,
        profit: 0,
        trips: 0
      };
    }

    filteredCollabTrips.forEach((t) => {
      if (!dateMap[t.date]) {
        dateMap[t.date] = {
          date: t.date,
          displayDate: t.date.slice(5),
          revenue: 0,
          expenses: 0,
          profit: 0,
          trips: 0
        };
      }
      dateMap[t.date].revenue += t.totalAmount;
      dateMap[t.date].expenses += (t.fuelExpense || 0) + (t.driverPay || 0);
      dateMap[t.date].trips += t.tripsCount;
    });

    filteredPrivateTrips.forEach((t) => {
      if (!dateMap[t.date]) {
        dateMap[t.date] = {
          date: t.date,
          displayDate: t.date.slice(5),
          revenue: 0,
          expenses: 0,
          profit: 0,
          trips: 0
        };
      }
      dateMap[t.date].revenue += t.totalAmount;
      dateMap[t.date].expenses += t.fuelExpense || 0;
      dateMap[t.date].trips += 1;
    });

    filteredExpenses.forEach((e) => {
      if (!dateMap[e.date]) {
        dateMap[e.date] = {
          date: e.date,
          displayDate: e.date.slice(5),
          revenue: 0,
          expenses: 0,
          profit: 0,
          trips: 0
        };
      }
      dateMap[e.date].expenses += e.amount;
    });

    return Object.values(dateMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        ...item,
        profit: Math.max(0, item.revenue - item.expenses)
      }));
  }, [filteredCollabTrips, filteredPrivateTrips, filteredExpenses, selectedDateFilter]);

  // Expense breakdown pie chart data by category
  const expensePieData = useMemo(() => {
    const total = filteredSummary.totalExpenses;
    const items = [
      { name: 'Fuel', value: filteredSummary.totalFuel, color: '#f43f5e' },       // Rose 500
      { name: 'Driver Pay', value: filteredSummary.totalDriverPay, color: '#f97316' }, // Orange 500
      { name: 'Toll/Tax', value: filteredSummary.totalTolls, color: '#38bdf8' },     // Sky 400
      { name: 'Servicing', value: filteredSummary.totalServicing, color: '#a855f7' },  // Purple 500
      { name: 'Misc', value: filteredSummary.totalMisc, color: '#9ca3af' }           // Gray 400
    ].filter((item) => item.value > 0);

    return items.map((item) => ({
      ...item,
      percentage: total > 0 ? Math.round((item.value / total) * 100) : 0
    }));
  }, [filteredSummary]);

  // Today-specific quick counters for top cards
  const todayStats = useMemo(() => {
    const todayCollab = data.collabTrips.filter((t) => t.date === todayStr);
    const todayPrivate = data.privateTrips.filter((t) => t.date === todayStr);
    const todayExp = data.expenses.filter((e) => e.date === todayStr);

    const collabRev = todayCollab.reduce((a, b) => a + b.totalAmount, 0);
    const collabCount = todayCollab.reduce((a, b) => a + b.tripsCount, 0);
    const privateRev = todayPrivate.reduce((a, b) => a + b.totalAmount, 0);
    const privateCount = todayPrivate.reduce((a, b) => a + b.tripsCount, 0);

    const collabFuel = todayCollab.reduce((a, b) => a + b.fuelExpense, 0);
    const collabDriver = todayCollab.reduce((a, b) => a + b.driverPay, 0);
    const privateFuel = todayPrivate.reduce((a, b) => a + b.extraFuelCost, 0);
    const expTotal = todayExp.reduce((a, b) => a + b.amount, 0);

    const totalExp = collabFuel + collabDriver + privateFuel + expTotal;
    const gross = collabRev + privateRev;
    const profit = gross - totalExp;

    return {
      collabRev,
      collabCount,
      privateRev,
      privateCount,
      totalExp,
      gross,
      profit
    };
  }, [data.collabTrips, data.privateTrips, data.expenses, todayStr]);

  // Month-over-Month Performance Comparison
  const monthComparisonStats = useMemo(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    const currPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const prevDate = new Date(currentYear, currentMonth - 1, 1);
    const prevPrefix = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    const getStatsForPrefix = (prefix: string) => {
      const cTrips = data.collabTrips.filter((t) => t.date.startsWith(prefix));
      const pTrips = data.privateTrips.filter((t) => t.date.startsWith(prefix));
      const exps = data.expenses.filter((e) => e.date.startsWith(prefix));

      const collabRev = cTrips.reduce((a, b) => a + b.totalAmount, 0);
      const privateRev = pTrips.reduce((a, b) => a + b.totalAmount, 0);
      const grossRev = collabRev + privateRev;

      const collabFuel = cTrips.reduce((a, b) => a + b.fuelExpense, 0);
      const collabDriver = cTrips.reduce((a, b) => a + b.driverPay, 0);
      const privateFuel = pTrips.reduce((a, b) => a + b.extraFuelCost, 0);
      const genExp = exps.reduce((a, b) => a + b.amount, 0);

      const totalExp = collabFuel + collabDriver + privateFuel + genExp;
      const profit = grossRev - totalExp;

      return { collabRev, privateRev, grossRev, totalExp, profit };
    };

    let curr = getStatsForPrefix(currPrefix);
    let prev = getStatsForPrefix(prevPrefix);

    if (prev.grossRev === 0 && prev.totalExp === 0) {
      const getStatsForDaysRange = (startDay: number, endDay: number) => {
        let collabRev = 0;
        let privateRev = 0;
        let totalExp = 0;
        for (let i = startDay; i <= endDay; i++) {
          const dStr = getTodayString(i);
          const cTrips = data.collabTrips.filter((t) => t.date === dStr);
          const pTrips = data.privateTrips.filter((t) => t.date === dStr);
          const exps = data.expenses.filter((e) => e.date === dStr);

          collabRev += cTrips.reduce((a, b) => a + b.totalAmount, 0);
          privateRev += pTrips.reduce((a, b) => a + b.totalAmount, 0);

          totalExp += cTrips.reduce((a, b) => a + (b.fuelExpense || 0) + (b.driverPay || 0), 0) +
                      pTrips.reduce((a, b) => a + (b.extraFuelCost || 0), 0) +
                      exps.reduce((a, b) => a + b.amount, 0);
        }
        const grossRev = collabRev + privateRev;
        return { collabRev, privateRev, grossRev, totalExp, profit: grossRev - totalExp };
      };

      curr = getStatsForDaysRange(0, 14);
      prev = getStatsForDaysRange(15, 29);
    }

    const calcPct = (currVal: number, prevVal: number) => {
      if (prevVal === 0) return currVal > 0 ? 100 : 0;
      return Math.round(((currVal - prevVal) / Math.abs(prevVal)) * 100);
    };

    return {
      revenueChangePct: calcPct(curr.grossRev, prev.grossRev),
      profitChangePct: calcPct(curr.profit, prev.profit),
      collabChangePct: calcPct(curr.collabRev, prev.collabRev),
      privateChangePct: calcPct(curr.privateRev, prev.privateRev),
      expenseChangePct: calcPct(curr.totalExp, prev.totalExp)
    };
  }, [data.collabTrips, data.privateTrips, data.expenses]);

  // Combined Activity Stream (sorted chronologically descending)
  const combinedActivityStream = useMemo(() => {
    const stream: Array<{
      id: string;
      type: 'collab' | 'private' | 'expense' | 'payment';
      date: string;
      title: string;
      subtitle: string;
      amount: number;
      isIncome: boolean;
      settled?: boolean;
      collaboratorName?: string;
      rawObject: any;
      timestamp: number;
    }> = [];

    data.collabTrips.forEach((c) => {
      const cName = c.collaboratorName || (data.collaborators || defaultCollaborators).find((col) => col.id === c.collaboratorId)?.name || 'Collaborator';
      const routeText = (c.loadingPoint || c.unloadingPoint)
        ? ` • Route: ${c.loadingPoint || 'Kucharam'}${c.unloadingPoint ? ` ➔ ${c.unloadingPoint}` : ''}`
        : '';
      const displayTitle = c.unloadingPoint?.trim()
        ? `${c.unloadingPoint.trim()} (${c.shift} Shift)`
        : `Collab Trip (${c.shift} Shift)`;
      stream.push({
        id: c.id,
        type: 'collab',
        date: c.date,
        title: displayTitle,
        subtitle: `${cName} • ${c.tripsCount} Trips @ ${sym}${c.ratePerTrip}/trip${routeText}${c.notes ? ` • ${c.notes}` : ''}`,
        amount: c.totalAmount,
        isIncome: true,
        settled: c.settled,
        collaboratorName: cName,
        rawObject: c,
        timestamp: c.timestamp || new Date(c.date).getTime()
      });
    });

    data.privateTrips.forEach((p) => {
      stream.push({
        id: p.id,
        type: 'private',
        date: p.date,
        title: `Private: ${p.customerName || 'Ad-hoc Customer'}`,
        subtitle: `${p.tripsCount} Trips • Pay: ${p.paymentStatus}`,
        amount: p.totalAmount,
        isIncome: true,
        rawObject: p,
        timestamp: p.timestamp || new Date(p.date).getTime()
      });
    });

    data.expenses.forEach((e) => {
      stream.push({
        id: e.id,
        type: 'expense',
        date: e.date,
        title: `Expense: ${e.category}`,
        subtitle: e.notes || 'General expense',
        amount: e.amount,
        isIncome: false,
        rawObject: e,
        timestamp: e.timestamp || new Date(e.date).getTime()
      });
    });

    data.paymentsReceived.forEach((pr) => {
      const cName = pr.collaboratorName || (data.collaborators || defaultCollaborators).find((col) => col.id === pr.collaboratorId)?.name || 'Collaborator';
      stream.push({
        id: pr.id,
        type: 'payment',
        date: pr.date,
        title: `Payout Received: ${cName}`,
        subtitle: pr.referenceNote || 'Balance clearance',
        amount: pr.amount,
        isIncome: true,
        collaboratorName: cName,
        rawObject: pr,
        timestamp: pr.timestamp || new Date(pr.date).getTime()
      });
    });

    return stream.sort((a, b) => b.timestamp - a.timestamp);
  }, [data.collabTrips, data.privateTrips, data.expenses, data.paymentsReceived, data.collaborators, sym]);

  // Filtered Logs for Logs View
  const filteredLogsList = useMemo(() => {
    return combinedActivityStream.filter((item) => {
      // Category filter
      if (logsCategory === 'collab' && item.type !== 'collab') return false;
      if (logsCategory === 'private' && item.type !== 'private') return false;
      if (logsCategory === 'expense' && item.type !== 'expense') return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchSubtitle = item.subtitle.toLowerCase().includes(q);
        const matchDate = item.date.includes(q);
        return matchTitle || matchSubtitle || matchDate;
      }
      return true;
    });
  }, [combinedActivityStream, logsCategory, searchQuery]);

  // ==========================================
  // HANDLERS & ACTIONS
  // ==========================================

  // Open Edit Modal for a specific log item
  const handleEditItem = (item: { id: string; type: 'collab' | 'private' | 'expense' | 'payment'; rawObject: any }) => {
    const { id, type, rawObject } = item;
    setEditingId(id);

    if (type === 'collab') {
      setCollabForm({
        date: rawObject.date || getTodayString(0),
        shift: rawObject.shift || 'Day',
        collaboratorId: rawObject.collaboratorId || collaboratorsList[0]?.id || '',
        tripsCount: rawObject.tripsCount || 1,
        ratePerTrip: rawObject.ratePerTrip !== undefined && rawObject.ratePerTrip !== null ? rawObject.ratePerTrip : 0,
        fuelExpense: 0,
        driverPay: 0,
        notes: rawObject.notes || '',
        loadingPoint: rawObject.loadingPoint || 'Kucharam-Loading point',
        unloadingPoint: rawObject.unloadingPoint || ''
      });
      setActiveModal('collab');
    } else if (type === 'private') {
      setPrivateForm({
        date: rawObject.date || getTodayString(0),
        customerName: rawObject.customerName || '',
        tripsCount: rawObject.tripsCount || 1,
        ratePerTrip: rawObject.ratePerTrip || 0,
        paymentStatus: rawObject.paymentStatus || 'Cash',
        extraFuelCost: rawObject.extraFuelCost || 0,
        notes: rawObject.notes || ''
      });
      setActiveModal('private');
    } else if (type === 'expense') {
      setExpenseForm({
        date: rawObject.date || getTodayString(0),
        category: rawObject.category || 'Fuel',
        amount: rawObject.amount || 0,
        notes: rawObject.notes || ''
      });
      setActiveModal('expense');
    } else if (type === 'payment') {
      setPaymentForm({
        date: rawObject.date || getTodayString(0),
        collaboratorId: rawObject.collaboratorId || collaboratorsList[0]?.id || '',
        amount: rawObject.amount || 0,
        referenceNote: rawObject.referenceNote || ''
      });
      setActiveModal('payment');
    }
  };

  // Submit Collab Trip (Create or Edit)
  const handleSaveCollabTrip = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const collabs = data.collaborators || [];
    if (collabs.length === 0) {
      alert('Please add a collaborator first before logging a collaborator trip.');
      setShowAddCollabModal(true);
      return;
    }
    const count = Number(collabForm.tripsCount) || 1;
    const rate = collabForm.ratePerTrip === '' ? 0 : Number(collabForm.ratePerTrip);
    const totalAmount = count * rate;

    const collabObj = collabs.find((c) => c.id === collabForm.collaboratorId) || collabs[0];
    const collaboratorId = collabObj?.id || '';
    const collaboratorName = collabObj?.name || 'Collaborator';

    if (editingId) {
      setData((prev) => ({
        ...prev,
        collabTrips: prev.collabTrips.map((t) =>
          t.id === editingId
            ? {
                ...t,
                date: collabForm.date,
                shift: collabForm.shift,
                collaboratorId,
                collaboratorName,
                tripsCount: count,
                ratePerTrip: rate,
                totalAmount,
                fuelExpense: 0,
                driverPay: 0,
                notes: collabForm.notes,
                loadingPoint: collabForm.loadingPoint || 'Kucharam-Loading point',
                unloadingPoint: collabForm.unloadingPoint || ''
              }
            : t
        )
      }));
      const savedDate = collabForm.date;
      setEditingId(null);
      setActiveModal(null);
      setIsFabOpen(false);

      setTransactionSuccessModal({
        type: 'collab',
        title: 'Collaborator Trip Updated!',
        subtitle: `${collaboratorName} • ${count} Trip(s) (${collabForm.shift} Shift)`,
        amount: totalAmount,
        date: savedDate
      });
      return;
    }

    const newTrip: CollabTrip = {
      id: 'ct-' + Date.now(),
      userId: currentUserId,
      date: collabForm.date,
      shift: collabForm.shift,
      collaboratorId,
      collaboratorName,
      tripsCount: count,
      ratePerTrip: rate,
      totalAmount,
      fuelExpense: 0,
      driverPay: 0,
      settled: false,
      notes: collabForm.notes,
      loadingPoint: collabForm.loadingPoint || 'Kucharam',
      unloadingPoint: collabForm.unloadingPoint || '',
      timestamp: Date.now()
    };

    setData((prev) => ({
      ...prev,
      collabTrips: [newTrip, ...prev.collabTrips]
    }));

    const savedDate = collabForm.date;

    setCollabForm((prev) => ({
      ...prev,
      notes: '',
      fuelExpense: 0,
      driverPay: 0,
      loadingPoint: 'Kucharam',
      unloadingPoint: ''
    }));

    setActiveModal(null);
    setIsFabOpen(false);

    setTransactionSuccessModal({
      type: 'collab',
      title: 'Collaborator Trip Logged!',
      subtitle: `${collaboratorName} • ${count} Trip(s) (${collabForm.shift} Shift)`,
      amount: totalAmount,
      date: savedDate
    });
  };

  // Submit Private Trip (Create or Edit)
  const handleSavePrivateTrip = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const count = Number(privateForm.tripsCount) || 1;
    const rate = Number(privateForm.ratePerTrip) || 0;
    const totalAmount = count * rate;

    if (editingId) {
      setData((prev) => ({
        ...prev,
        privateTrips: prev.privateTrips.map((p) =>
          p.id === editingId
            ? {
                ...p,
                date: privateForm.date,
                customerName: privateForm.customerName.trim() || 'Private Client',
                tripsCount: count,
                ratePerTrip: rate,
                totalAmount,
                paymentStatus: privateForm.paymentStatus,
                extraFuelCost: Number(privateForm.extraFuelCost) || 0,
                notes: privateForm.notes
              }
            : p
        )
      }));
      const savedDate = privateForm.date;
      setEditingId(null);
      setActiveModal(null);
      setIsFabOpen(false);

      setTransactionSuccessModal({
        type: 'private',
        title: 'Private Trip Updated!',
        subtitle: `${privateForm.customerName.trim() || 'Private Client'} • ${count} Trip(s)`,
        amount: totalAmount,
        date: savedDate
      });
      return;
    }

    const newTrip: PrivateTrip = {
      id: 'pt-' + Date.now(),
      userId: currentUserId,
      date: privateForm.date,
      customerName: privateForm.customerName.trim() || 'Private Client',
      tripsCount: count,
      ratePerTrip: rate,
      totalAmount,
      paymentStatus: privateForm.paymentStatus,
      extraFuelCost: Number(privateForm.extraFuelCost) || 0,
      notes: privateForm.notes,
      timestamp: Date.now()
    };

    setData((prev) => ({
      ...prev,
      privateTrips: [newTrip, ...prev.privateTrips]
    }));

    const savedDate = privateForm.date;
    const savedCustomer = privateForm.customerName.trim() || 'Private Client';
    const savedFuel = Number(privateForm.extraFuelCost) || 0;

    setPrivateForm((prev) => ({
      ...prev,
      customerName: '',
      notes: '',
      extraFuelCost: 0
    }));

    setActiveModal(null);
    setIsFabOpen(false);

    setTransactionSuccessModal({
      type: 'private',
      title: 'Private Trip Logged!',
      subtitle: `${savedCustomer} • ${count} Trip(s)`,
      amount: totalAmount,
      date: savedDate,
      savedDate,
      savedCustomer,
      savedFuel
    });
  };

  // Submit Expense (Create or Edit)
  const handleSaveExpense = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const amountVal = Number(expenseForm.amount) || 0;

    if (editingId) {
      setData((prev) => ({
        ...prev,
        expenses: prev.expenses.map((ex) =>
          ex.id === editingId
            ? {
                ...ex,
                date: expenseForm.date,
                category: expenseForm.category,
                amount: amountVal,
                notes: expenseForm.notes
              }
            : ex
        )
      }));
      const savedDate = expenseForm.date;
      setEditingId(null);
      setActiveModal(null);
      setIsFabOpen(false);

      setTransactionSuccessModal({
        type: 'expense',
        title: 'Expense Updated!',
        subtitle: `${expenseForm.category} Expense`,
        amount: amountVal,
        date: savedDate
      });
      return;
    }

    const newExpense: Expense = {
      id: 'ex-' + Date.now(),
      userId: currentUserId,
      date: expenseForm.date,
      category: expenseForm.category,
      amount: amountVal,
      notes: expenseForm.notes,
      timestamp: Date.now()
    };

    setData((prev) => ({
      ...prev,
      expenses: [newExpense, ...prev.expenses]
    }));

    const savedDate = expenseForm.date;
    const savedCategory = expenseForm.category;

    setExpenseForm((prev) => ({
      ...prev,
      amount: 0,
      notes: ''
    }));

    setActiveModal(null);
    setIsFabOpen(false);

    setTransactionSuccessModal({
      type: 'expense',
      title: 'Expense Logged!',
      subtitle: `${savedCategory} Expense`,
      amount: amountVal,
      date: savedDate
    });
  };

  // Submit Payment Received (Create or Edit)
  const handleSavePayment = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const collabs = data.collaborators || [];
    if (collabs.length === 0) {
      alert('Please add a collaborator first before recording a payment.');
      setShowAddCollabModal(true);
      return;
    }
    const collabObj = collabs.find((c) => c.id === paymentForm.collaboratorId) || collabs[0];
    const collaboratorId = collabObj?.id || '';
    const collaboratorName = collabObj?.name || 'Collaborator';
    const amountVal = Number(paymentForm.amount) || 0;

    if (editingId) {
      setData((prev) => ({
        ...prev,
        paymentsReceived: prev.paymentsReceived.map((pr) =>
          pr.id === editingId
            ? {
                ...pr,
                date: paymentForm.date,
                collaboratorId,
                collaboratorName,
                amount: amountVal,
                referenceNote: paymentForm.referenceNote.trim() || 'Collaborator Payout'
              }
            : pr
        )
      }));
      const savedDate = paymentForm.date;
      setEditingId(null);
      setActiveModal(null);
      setIsFabOpen(false);

      setTransactionSuccessModal({
        type: 'payment',
        title: 'Payout Updated!',
        subtitle: `Payout to ${collaboratorName}`,
        amount: amountVal,
        date: savedDate
      });
      return;
    }

    const newPayment: PaymentReceived = {
      id: 'pr-' + Date.now(),
      userId: currentUserId,
      date: paymentForm.date,
      collaboratorId,
      collaboratorName,
      amount: amountVal,
      referenceNote: paymentForm.referenceNote.trim() || 'Collaborator Payout',
      timestamp: Date.now()
    };

    setData((prev) => ({
      ...prev,
      paymentsReceived: [newPayment, ...prev.paymentsReceived]
    }));

    const savedDate = paymentForm.date;

    setPaymentForm((prev) => ({
      ...prev,
      amount: 0,
      referenceNote: ''
    }));

    setActiveModal(null);
    setIsFabOpen(false);

    setTransactionSuccessModal({
      type: 'payment',
      title: 'Payout Logged!',
      subtitle: `Payout to ${collaboratorName}`,
      amount: amountVal,
      date: savedDate
    });
  };

  // Open Edit Collaborator Modal
  const handleEditCollaborator = (collab: Collaborator) => {
    setEditingCollabId(collab.id);
    setNewCollabForm({
      name: collab.name || '',
      phone: collab.phone || '',
      defaultRate: collab.defaultRate !== undefined && collab.defaultRate !== null ? collab.defaultRate : 600,
      notes: collab.notes || ''
    });
    setShowAddCollabModal(true);
  };

  // Create or Edit Collaborator
  const handleCreateCollaborator = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newCollabForm.name.trim()) return;

    const parsedRate = newCollabForm.defaultRate === '' ? 0 : Number(newCollabForm.defaultRate);
    const rateVal = isNaN(parsedRate) ? 0 : parsedRate;

    if (editingCollabId) {
      const updatedName = newCollabForm.name.trim();
      setData((prev) => ({
        ...prev,
        collaborators: (prev.collaborators || []).map((c) =>
          c.id === editingCollabId
            ? {
                ...c,
                name: updatedName,
                phone: newCollabForm.phone.trim(),
                defaultRate: rateVal,
                notes: newCollabForm.notes.trim()
              }
            : c
        ),
        collabTrips: prev.collabTrips.map((ct) =>
          ct.collaboratorId === editingCollabId
            ? { ...ct, collaboratorName: updatedName }
            : ct
        ),
        paymentsReceived: prev.paymentsReceived.map((pr) =>
          pr.collaboratorId === editingCollabId
            ? { ...pr, collaboratorName: updatedName }
            : pr
        )
      }));

      setCollabForm((prev) => {
        if (prev.collaboratorId === editingCollabId) {
          return { ...prev, ratePerTrip: rateVal };
        }
        return prev;
      });

      setEditingCollabId(null);
      setNewCollabForm({ name: '', phone: '', defaultRate: 600, notes: '' });
      setShowAddCollabModal(false);
      return;
    }

    const created: Collaborator = {
      id: 'collab-' + Date.now(),
      userId: currentUserId,
      name: newCollabForm.name.trim(),
      phone: newCollabForm.phone.trim(),
      defaultRate: rateVal,
      notes: newCollabForm.notes.trim()
    };

    setData((prev) => ({
      ...prev,
      collaborators: [...(prev.collaborators || []), created]
    }));

    setCollabForm((prev) => ({
      ...prev,
      collaboratorId: created.id,
      ratePerTrip: created.defaultRate
    }));

    setPaymentForm((prev) => ({
      ...prev,
      collaboratorId: created.id
    }));

    setNewCollabForm({ name: '', phone: '', defaultRate: 600, notes: '' });
    setShowAddCollabModal(false);
  };

  // Request Delete Modal Trigger
  const requestDelete = (
    id: string,
    type: 'collab' | 'private' | 'expense' | 'payment' | 'collaborator',
    title?: string
  ) => {
    let defaultTitle = 'Delete Record';
    let description = 'Are you sure you want to delete this record? This action cannot be undone.';

    if (type === 'collab') defaultTitle = 'Delete Collab Trip';
    else if (type === 'private') defaultTitle = 'Delete Private Trip';
    else if (type === 'expense') defaultTitle = 'Delete Expense';
    else if (type === 'payment') defaultTitle = 'Delete Payout Record';
    else if (type === 'collaborator') {
      defaultTitle = 'Remove Collaborator';
      description = 'Are you sure you want to remove this collaborator? Existing logged trips will remain in history.';
    }

    setDeleteConfirmTarget({
      id,
      type,
      title: title || defaultTitle,
      description
    });
  };

  // Direct Execute Delete after user confirmation
  const executeDelete = () => {
    if (!deleteConfirmTarget) return;
    const { id, type } = deleteConfirmTarget;

    setData((prev) => {
      if (type === 'collab') {
        return { ...prev, collabTrips: prev.collabTrips.filter((i) => i.id !== id) };
      } else if (type === 'private') {
        return { ...prev, privateTrips: prev.privateTrips.filter((i) => i.id !== id) };
      } else if (type === 'expense') {
        return { ...prev, expenses: prev.expenses.filter((i) => i.id !== id) };
      } else if (type === 'payment') {
        return { ...prev, paymentsReceived: prev.paymentsReceived.filter((i) => i.id !== id) };
      } else if (type === 'collaborator') {
        return { ...prev, collaborators: (prev.collaborators || []).filter((c) => c.id !== id) };
      } else if (type === 'clear_all') {
        const emptyData = getInitialData();
        try {
          localStorage.setItem(PRIMARY_STORAGE_KEY, JSON.stringify(emptyData));
          localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(emptyData));
        } catch (e) {
          console.error('Failed to clear storage', e);
        }
        return emptyData;
      } else if (type === 'reset_sample') {
        return getInitialData();
      }
      return prev;
    });

    setDeleteConfirmTarget(null);
    if (activeModal === 'settings') {
      setActiveModal(null);
    }
  };

  // Delete Collaborator
  const handleDeleteCollaborator = (id: string) => {
    requestDelete(id, 'collaborator');
  };

  // Clear / Reset All App Data
  const handleClearAllData = () => {
    setDeleteConfirmTarget({
      id: 'clear_all',
      type: 'clear_all',
      title: 'Clear All App Data',
      description: 'Are you sure you want to remove all logs, trips, expenses, payouts, and collaborators? This will clear all data from the app.'
    });
  };

  // Submit Settings
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setData((prev) => ({
      ...prev,
      settings: settingsForm
    }));
    setActiveModal(null);
  };

  // Toggle Settle status on Collab Trip
  const handleToggleCollabSettled = (id: string) => {
    setData((prev) => ({
      ...prev,
      collabTrips: prev.collabTrips.map((ct) => (ct.id === id ? { ...ct, settled: !ct.settled } : ct))
    }));
  };

  // Delete Log item
  const handleDeleteItem = (id: string, type: 'collab' | 'private' | 'expense' | 'payment') => {
    requestDelete(id, type);
  };

  // Reset Data to Initial Mock Data
  const handleResetData = () => {
    setDeleteConfirmTarget({
      id: 'reset_sample',
      type: 'reset_sample',
      title: 'Reset to Sample Data',
      description: 'Reset all TIPPERLOG data to default sample logs? Your current data will be overwritten.'
    });
  };

  // Export JSON backup
  const handleExportData = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `tipperlog_backup_${getTodayString(0)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import JSON backup
  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], 'UTF-8');
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed && parsed.collabTrips && parsed.settings) {
            setData(parsed);
            alert('TIPPERLOG data imported successfully!');
          } else {
            alert('Invalid backup file format.');
          }
        } catch (err) {
          alert('Failed to parse backup file.');
        }
      };
    }
  };

  if (!isAuthenticated) {
    return (
      <LoginPage
        ownerName={data.settings.ownerName}
        vehicleRegNo={data.settings.vehicleRegNo}
        onLoginSuccess={(userProfile) => {
          if (userProfile) {
            setCurrentUserProfile(userProfile);
          }
          if (userProfile?.fullName) {
            setData((prev) => ({
              ...prev,
              settings: {
                ...prev.settings,
                ownerName: userProfile.fullName,
                vehicleRegNo: userProfile.vehicleRegNo || prev.settings.vehicleRegNo
              }
            }));
          }
          setIsAuthenticated(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-amber-400 selection:text-black">
      {/* ========================================== */}
      {/* 1. HEADER & BRANDING BAR                   */}
      {/* ========================================== */}
      <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3">
        <div className="max-w-md md:max-w-4xl lg:max-w-6xl xl:max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Top Row: Logo Badge & Action Buttons */}
          <div className="flex items-center justify-between w-full md:w-auto">
            {/* Logo Badge - SVG Image */}
            <div className="flex items-center space-x-2.5">
              <img src="/icon.svg" alt="TIPPERLOG Logo" className="w-9 h-9 rounded-xl shadow-xs shrink-0 object-contain" />
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold tracking-tight text-lg text-white font-sans">
                    TIPPERLOG
                  </span>
                </div>
                <p
                  className="text-xs text-zinc-400 flex items-center space-x-1.5 font-mono cursor-pointer"
                  onClick={() => setShowSupabaseModal(true)}
                  title={
                    isSyncing
                      ? 'Database Syncing...'
                      : supabaseConnected
                      ? 'Database Connected'
                      : 'Database Offline'
                  }
                >
                  <span
                    className={`inline-block w-2 h-2 rounded-full transition-colors ${
                      isSyncing
                        ? 'bg-amber-400 animate-pulse'
                        : supabaseConnected
                        ? 'bg-emerald-400'
                        : 'bg-rose-500'
                    }`}
                  ></span>
                  <span>{data.settings.vehicleRegNo}</span>
                </p>
              </div>
            </div>

            {/* Header Action Buttons (Mobile View) */}
            <div className="flex md:hidden items-center space-x-1.5">
              <button
                onClick={() => setShowPdfReportModal(true)}
                className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-mono font-medium transition flex items-center space-x-1.5 shadow-xs"
                title="Export Printable PDF Accounting Ledger"
              >
                <Printer className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                <span className="hidden sm:inline font-bold">PDF</span>
              </button>

              <button
                onClick={() => handleOpenSettings('menu')}
                className="p-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl border border-zinc-800 transition"
                title="App Settings Menu"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Desktop/Tablet Header Section: Date Filters + Tab Navigation + Actions */}
          <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto">
            {/* Desktop Navigation Tabs */}
            <div className="hidden md:flex items-center space-x-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 text-xs">
              {[
                { id: 'dashboard', label: 'Overview', icon: PieChart },
                { id: 'logs', label: 'Trips/Logs', icon: FileText },
                { id: 'ledger', label: 'Ledger', icon: Receipt },
                { id: 'analytics', label: 'Reviews', icon: BarChart3 }
              ].map((tab) => {
                const IconComponent = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 ${
                      isActive
                        ? 'bg-amber-400 text-zinc-950 shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Date Filter Segmented Controls */}
            <div className="flex-1 md:flex-initial flex items-center justify-between space-x-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800/80 text-xs">
              {(
                [
                  { id: 'today', label: 'Today' },
                  { id: 'this_week', label: 'This Week' },
                  { id: 'this_month', label: 'This Month' },
                  { id: 'all', label: 'All Time' }
                ] as const
              ).map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setSelectedDateFilter(filter.id)}
                  className={`flex-1 md:px-3 py-1.5 rounded-lg font-medium transition text-center whitespace-nowrap ${
                    selectedDateFilter === filter.id
                      ? 'bg-amber-400 text-zinc-950 font-bold shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* Header Action Buttons (Tablet/Desktop View) */}
            <div className="hidden md:flex items-center space-x-1.5">
              <button
                onClick={() => setShowPdfReportModal(true)}
                className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-mono font-medium transition flex items-center space-x-1.5 shadow-xs"
                title="Export Printable PDF Accounting Ledger"
              >
                <Printer className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                <span className="font-bold">PDF Report</span>
              </button>

              <button
                onClick={() => handleOpenSettings('menu')}
                className="p-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl border border-zinc-800 transition"
                title="App Settings Menu"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ========================================== */}
      {/* MAIN VIEW CONTENT CONTAINER                */}
      {/* ========================================== */}
      <main className="flex-1 max-w-md md:max-w-4xl lg:max-w-6xl xl:max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 pb-28 space-y-6">
        {/* ========================================== */}
        {/* VIEW 1: DASHBOARD OVERVIEW                 */}
        {/* ========================================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Owner Greeting Banner */}
            <div className="flex items-center justify-between px-1 pt-1">
              <div>
                <h2 className="text-lg font-extrabold text-white tracking-tight flex items-center space-x-1.5">
                  <span>Hello {data.settings.ownerName ? `'${data.settings.ownerName}'` : "'Owner'"}</span>
                  <span className="text-amber-400">👋</span>
                </h2>
                <p className="text-xs text-zinc-400 font-mono">Here is your fleet performance overview</p>
              </div>
            </div>

            {/* Top Row: Total Trips Overview Card + Unsettled Collaborator Card (Grid on LG/Desktop) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Top Stat Card: Total Trips Overview (Minimalist Clean Design) */}
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between space-y-3 transition-all duration-300 hover:-translate-y-1 hover:border-zinc-700 hover:shadow-lg hover:shadow-emerald-500/5">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
                  <span>TOTAL TRIPS ({selectedDateFilter.replace('_', ' ')})</span>
                  <span className="bg-zinc-800 text-emerald-400 px-2.5 py-0.5 rounded-full text-[11px] font-mono border border-zinc-700/50">
                    Gross: {formatCurrency(filteredSummary.grossRevenue, sym)}
                  </span>
                </div>

                <div className="flex items-baseline justify-between">
                  <div className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-white flex items-baseline space-x-1.5">
                    <span>{filteredSummary.totalTrips}</span>
                    <span className="text-xs sm:text-sm font-normal text-zinc-400">Trips</span>
                  </div>
                  <div className="text-xs sm:text-sm font-mono text-zinc-300 font-medium">
                    <span className="text-zinc-400">Net Profit: </span>
                    <span className="text-emerald-400 font-bold">{formatCurrency(filteredSummary.netProfit, sym)}</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
                    <span>Expenses: {formatCurrency(filteredSummary.totalExpenses, sym)}</span>
                    <span>Margin: {filteredSummary.grossRevenue > 0 ? Math.round((filteredSummary.netProfit / filteredSummary.grossRevenue) * 100) : 0}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden flex">
                    <div
                      className="bg-emerald-400 h-full transition-all duration-500 rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, filteredSummary.grossRevenue > 0 ? (filteredSummary.netProfit / filteredSummary.grossRevenue) * 100 : 0))}%`
                      }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* UNSETTLED COLLABORATOR BALANCE WIDGET */}
              <div className="bg-gradient-to-r from-amber-950/80 via-zinc-900 to-zinc-900 border-2 border-amber-500/40 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between space-y-3 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-amber-400 hover:shadow-amber-500/20">
                <div className="space-y-2">
                  <div className="flex items-center space-x-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 animate-bounce" />
                    <span className="text-xs font-bold text-amber-400 tracking-wider uppercase font-mono">
                      UNSETTLED COLLABORATOR BALANCE
                    </span>
                  </div>
                  <div className="text-3xl sm:text-4xl font-black font-mono text-white tracking-tight">
                    {formatCurrency(unsettledCollabBalance, sym)}
                  </div>
                  <p className="text-xs text-zinc-300">
                    Pending payout from Collaborator across <strong className="text-yellow-400 font-mono">{unsettledTripsCount}</strong> un-cleared trip shifts.
                  </p>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <button
                    onClick={() => {
                      setPaymentForm((prev) => ({ ...prev, amount: unsettledCollabBalance }));
                      setActiveModal('payment');
                    }}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center space-x-1 transition shadow-md"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>Record Payout Received</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('ledger')}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center space-x-1 border border-zinc-700 transition"
                  >
                    <span>Ledger</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* 4 Minimalist Summary Cards Grid (2 cols on Mobile, 4 cols on Tablet/Desktop) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              {/* Card 1: Collab Trips */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 p-3.5 sm:p-4 space-y-1 rounded-xl shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-amber-500/40 hover:bg-zinc-900/90 hover:shadow-md hover:shadow-amber-500/5">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-mono uppercase font-medium">
                  <span className="flex items-center text-amber-400">
                    <Truck className="w-3.5 h-3.5 mr-1" /> Collab
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {filteredSummary.collabTripsCount} Trips
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-mono font-bold text-white">
                  {formatCurrency(filteredSummary.collabRev, sym)}
                </div>
                <div className="text-[10px] text-zinc-500 pt-0.5 font-mono">
                  Fixed Rate
                </div>
              </div>

              {/* Card 2: Private Earnings */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 p-3.5 sm:p-4 space-y-1 rounded-xl shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/40 hover:bg-zinc-900/90 hover:shadow-md hover:shadow-emerald-500/5">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-mono uppercase font-medium">
                  <span className="flex items-center text-emerald-400">
                    <Briefcase className="w-3.5 h-3.5 mr-1" /> Private
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {filteredSummary.privateTripsCount} Trips
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-mono font-bold text-emerald-400">
                  {formatCurrency(filteredSummary.privateRev, sym)}
                </div>
                <div className="text-[10px] text-zinc-500 pt-0.5 font-mono">
                  Direct Cash
                </div>
              </div>

              {/* Card 3: Daily Expenses */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 p-3.5 sm:p-4 space-y-1 rounded-xl shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-rose-500/40 hover:bg-zinc-900/90 hover:shadow-md hover:shadow-rose-500/5">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-mono uppercase font-medium">
                  <span className="flex items-center text-rose-400">
                    <Fuel className="w-3.5 h-3.5 mr-1" /> Expenses
                  </span>
                  <span className="text-[10px] text-rose-400/80 font-mono">
                    Fuel + Pay
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-mono font-bold text-rose-400">
                  {formatCurrency(filteredSummary.totalExpenses, sym)}
                </div>
                <div className="text-[10px] text-zinc-500 pt-0.5 font-mono">
                  Fuel: {formatCurrency(filteredSummary.totalFuel, sym)}
                </div>
              </div>

              {/* Card 4: Operational Metrics */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 p-3.5 sm:p-4 space-y-1 rounded-xl shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-zinc-700 hover:bg-zinc-900/90 hover:shadow-md">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-mono uppercase font-medium">
                  <span className="flex items-center text-zinc-300">
                    <TrendingUp className="w-3.5 h-3.5 mr-1" /> Avg/Trip
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">Ratio</span>
                </div>
                <div className="text-xl sm:text-2xl font-mono font-bold text-white">
                  {formatCurrency(filteredSummary.avgRevenuePerTrip, sym)}
                </div>
                <div className="text-[10px] text-zinc-500 pt-0.5 font-mono">
                  Fuel Ratio: {filteredSummary.fuelCostRatio.toFixed(0)}%
                </div>
              </div>
            </div>

            {/* CHARTS SECTION */}
            <div className="w-full">
              {/* FINANCIAL PERFORMANCE TREND GRAPH */}
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="w-4 h-4 text-amber-400" />
                    <h3 className="text-xs font-bold text-white uppercase font-mono tracking-wider">
                      Revenue & Expense Area Trend
                    </h3>
                  </div>
                  <div className="flex items-center space-x-3 text-[10px] font-mono">
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50"></span>
                      <span className="text-zinc-300 font-semibold">Revenue</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400 shadow-sm shadow-rose-400/50"></span>
                      <span className="text-zinc-300 font-semibold">Expenses</span>
                    </span>
                  </div>
                </div>

                <div className="h-52 w-full pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#34d399" stopOpacity={0.45} />
                          <stop offset="95%" stopColor="#34d399" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#fb7185" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#fb7185" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis
                        dataKey="displayDate"
                        stroke="#71717a"
                        fontSize={10}
                        tickLine={false}
                        axisLine={{ stroke: '#27272a' }}
                      />
                      <YAxis
                        stroke="#71717a"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(val) => `${sym}${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#09090b',
                          borderColor: '#27272a',
                          borderRadius: '0.75rem',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          color: '#fff',
                          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                        }}
                        formatter={(value: any, name: any) => [
                          `${formatCurrency(Number(value) || 0, sym)}`,
                          name === 'revenue' ? 'Revenue' : 'Expenses'
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        name="revenue"
                        stroke="#34d399"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                        activeDot={{ r: 5, fill: '#34d399', stroke: '#09090b', strokeWidth: 2 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="expenses"
                        name="expenses"
                        stroke="#fb7185"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorExpenses)"
                        activeDot={{ r: 5, fill: '#fb7185', stroke: '#09090b', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* RECENT ACTIVITY STREAM */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider font-mono flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-yellow-400" />
                  <span>Recent Activity Stream</span>
                </h3>
                <button
                  onClick={() => setActiveTab('logs')}
                  className="text-xs text-yellow-400 hover:underline flex items-center space-x-1 font-mono"
                >
                  <span>View All Logs ({combinedActivityStream.length})</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              {/* Grid layout for Activity Cards on Tablet & Laptop */}
              <div className="space-y-2">
                {combinedActivityStream.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedTransactionDetail(item)}
                    className="bg-zinc-900 border border-zinc-800/90 hover:border-amber-500/40 rounded-xl px-3.5 py-2.5 flex items-center justify-between transition cursor-pointer group hover:bg-zinc-900/90"
                  >
                    {/* Left Section: Icon + Title + Settled Badge + Date */}
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <div
                        className={`p-2 rounded-lg shrink-0 ${
                          item.type === 'collab'
                            ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                            : item.type === 'private'
                            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                            : item.type === 'expense'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {item.type === 'collab' && <Truck className="w-4 h-4" />}
                        {item.type === 'private' && <Briefcase className="w-4 h-4" />}
                        {item.type === 'expense' && <Fuel className="w-4 h-4" />}
                        {item.type === 'payment' && <DollarSign className="w-4 h-4" />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2 truncate">
                          <span className="text-xs font-bold text-white truncate">{item.title}</span>
                          {item.type === 'collab' && item.settled && (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded font-extrabold shrink-0 bg-emerald-950 text-emerald-400 border border-emerald-800">
                              ✓ SETTLED
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 text-[10px] text-zinc-400 font-mono truncate">
                          <span className="truncate">{item.subtitle}</span>
                          <span>•</span>
                          <span className="shrink-0">{formatDateReadable(item.date)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Section: Amount + Details Arrow */}
                    <div className="flex items-center space-x-2.5 shrink-0 ml-3">
                      <div
                        className={`text-xs sm:text-sm font-bold font-mono ${
                          item.isIncome ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {item.isIncome ? '+' : '-'}{formatCurrency(item.amount, sym)}
                      </div>
                      <div className="p-1 rounded-lg bg-zinc-800/80 group-hover:bg-amber-500/20 text-zinc-400 group-hover:text-amber-400 transition">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                ))}

                {combinedActivityStream.length === 0 && (
                  <div className="col-span-full bg-zinc-900 border border-dashed border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-xs">
                    No logs recorded yet. Tap the yellow <span className="text-yellow-400 font-bold">+</span> button below to start logging!
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* VIEW 2: TRIPS & LOGS MANAGER              */}
        {/* ========================================== */}
        {activeTab === 'logs' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Header & Filter Segment */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black text-yellow-400 font-mono tracking-wider flex items-center space-x-2">
                  <FileText className="w-5 h-5" />
                  <span>TRIP & EXPENSE LOGS</span>
                </h2>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleOpenSettings('admin')}
                    className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-mono font-bold transition flex items-center space-x-1"
                    title="Open Admin Section in Settings to Edit My Trips"
                  >
                    <Lock className="w-3 h-3" />
                    <span>Admin Edit Mode</span>
                  </button>
                  <span className="text-xs text-zinc-400 font-mono">
                    {filteredLogsList.length} Entries
                  </span>
                </div>
              </div>

              {/* Search & Category Tabs Controls Bar */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Search input */}
                <div className="relative md:col-span-1">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search customer, note, date..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-500/50"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Category tabs */}
                <div className="md:col-span-2 flex items-center space-x-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs font-mono">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'collab', label: 'Collab 🚚' },
                    { id: 'private', label: 'Private 💼' },
                    { id: 'expense', label: 'Expenses ⛽' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setLogsCategory(tab.id as any)}
                      className={`flex-1 py-1.5 rounded-lg font-semibold transition text-center ${
                        logsCategory === tab.id
                          ? 'bg-yellow-500 text-black shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* List of Filtered Logs */}
            <div className="space-y-2">
              {filteredLogsList.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedTransactionDetail(item)}
                  className="bg-zinc-900 border border-zinc-800/90 hover:border-amber-500/40 rounded-xl px-3.5 py-2.5 flex items-center justify-between transition cursor-pointer group hover:bg-zinc-900/90"
                >
                  {/* Left Section: Icon + Title + Settled Badge + Subtitle/Date */}
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        item.type === 'collab'
                          ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                          : item.type === 'private'
                          ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                          : item.type === 'expense'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {item.type === 'collab' && <Truck className="w-4 h-4" />}
                      {item.type === 'private' && <Briefcase className="w-4 h-4" />}
                      {item.type === 'expense' && <Fuel className="w-4 h-4" />}
                      {item.type === 'payment' && <DollarSign className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2 truncate">
                        <span className="text-xs font-bold text-white truncate">{item.title}</span>
                        {item.type === 'collab' && item.settled && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded font-extrabold shrink-0 bg-emerald-950 text-emerald-400 border border-emerald-800">
                            ✓ SETTLED
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 text-[10px] text-zinc-400 font-mono truncate">
                        <span className="truncate">{item.subtitle}</span>
                        <span>•</span>
                        <span className="shrink-0">{formatDateReadable(item.date)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Section: Amount + Details Chevron */}
                  <div className="flex items-center space-x-2.5 shrink-0 ml-3">
                    <div
                      className={`text-xs sm:text-sm font-bold font-mono ${
                        item.isIncome ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {item.isIncome ? '+' : '-'}{formatCurrency(item.amount, sym)}
                    </div>
                    <div className="p-1 rounded-lg bg-zinc-800/80 group-hover:bg-amber-500/20 text-zinc-400 group-hover:text-amber-400 transition">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              ))}

              {filteredLogsList.length === 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-xs">
                  No matching log entries found for this query.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* VIEW 3: COLLABORATOR LEDGER               */}
        {/* ========================================== */}
        {activeTab === 'ledger' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Header & Filter */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-amber-400 font-mono tracking-wider flex items-center space-x-2">
                <Receipt className="w-5 h-5" />
                <span>COLLABORATOR LEDGER</span>
              </h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowPdfReportModal(true)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center space-x-1 transition shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Export PDF</span>
                </button>
                <button
                  onClick={() => setShowAddCollabModal(true)}
                  className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center space-x-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New</span>
                </button>
              </div>
            </div>

            {/* Collaborator Selector Dropdown */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center justify-between space-x-3">
              <span className="text-xs font-bold text-zinc-400 font-mono whitespace-nowrap flex items-center space-x-1.5">
                <Users className="w-4 h-4 text-amber-400" />
                <span>Filter:</span>
              </span>
              <select
                value={selectedLedgerCollabId}
                onChange={(e) => setSelectedLedgerCollabId(e.target.value)}
                className="bg-zinc-950 border border-zinc-700 text-amber-400 text-xs font-mono font-bold rounded-lg p-2 flex-1 focus:border-amber-400 focus:outline-none"
              >
                <option value="all">All Collaborators ({collaboratorBalances.length})</option>
                {collaboratorBalances.map((cb) => (
                  <option key={cb.id} value={cb.id}>
                    {cb.name} ({formatCurrency(cb.unsettled, sym)} owed)
                  </option>
                ))}
              </select>
            </div>

            {/* Collaborator Breakdown Cards Grid */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono flex items-center justify-between">
                <span>Collaborator Accounts ({collaboratorBalances.length})</span>
                <span className="text-[10px] text-zinc-500 font-normal">Tap payout to record payment</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {collaboratorBalances
                  .filter((cb) => selectedLedgerCollabId === 'all' || cb.id === selectedLedgerCollabId)
                  .map((cb) => (
                    <div
                      key={cb.id}
                      className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-amber-950/30 border border-zinc-800 hover:border-amber-500/50 rounded-xl p-3.5 space-y-3 transition shadow-md"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-white flex items-center space-x-1.5">
                            <Users className="w-4 h-4 text-amber-400" />
                            <span>{cb.name}</span>
                          </h4>
                          {cb.phone && <p className="text-[11px] text-zinc-400 font-mono mt-0.5">{cb.phone}</p>}
                          {cb.notes && <p className="text-[10px] text-zinc-500 italic mt-0.5">{cb.notes}</p>}
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded font-mono border border-amber-500/20 whitespace-nowrap">
                            {cb.totalTripsCount} Trips Total
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const rawCollab = (data.collaborators || []).find((c) => c.id === cb.id) || {
                                id: cb.id,
                                name: cb.name,
                                phone: cb.phone,
                                defaultRate: 600,
                                notes: cb.notes
                              };
                              handleEditCollaborator(rawCollab);
                            }}
                            className="p-1 text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition"
                            title="Edit Collaborator"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDelete(cb.id, 'collaborator', `Remove ${cb.name}`)}
                            className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                            title="Remove Collaborator"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-center bg-zinc-950/80 p-2 rounded-lg border border-zinc-800">
                        <div>
                          <span className="text-[10px] text-zinc-500 font-mono uppercase block">Earned</span>
                          <span className="text-xs font-bold text-zinc-200 font-mono">
                            {formatCurrency(cb.totalEarned, sym)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 font-mono uppercase block">Paid</span>
                          <span className="text-xs font-bold text-emerald-400 font-mono">
                            {formatCurrency(cb.totalPaid, sym)}
                          </span>
                        </div>
                      </div>

                      {/* Settled vs Unsettled Inline Ratio Bar Chart */}
                      <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800/80 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-zinc-400 font-bold uppercase tracking-wider">Settled vs Unsettled</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-emerald-400 flex items-center space-x-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                              <span>{cb.settledTripsCount} Settled</span>
                            </span>
                            <span className="text-amber-400 flex items-center space-x-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                              <span>{cb.unsettledTripsCount} Pending</span>
                            </span>
                          </div>
                        </div>

                        {cb.totalTripsCount > 0 ? (
                          <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden flex border border-zinc-800/80">
                            {cb.settledTripsCount > 0 && (
                              <div
                                style={{ width: `${(cb.settledTripsCount / cb.totalTripsCount) * 100}%` }}
                                className={`h-full bg-emerald-500 transition-all duration-300 ${
                                  cb.unsettledTripsCount === 0 ? 'rounded-full' : 'rounded-l-full'
                                }`}
                                title={`Settled: ${cb.settledTripsCount} trips (${Math.round(
                                  (cb.settledTripsCount / cb.totalTripsCount) * 100
                                )}%)`}
                              />
                            )}
                            {cb.unsettledTripsCount > 0 && (
                              <div
                                style={{ width: `${(cb.unsettledTripsCount / cb.totalTripsCount) * 100}%` }}
                                className={`h-full bg-amber-500 transition-all duration-300 ${
                                  cb.settledTripsCount === 0 ? 'rounded-full' : 'rounded-r-full'
                                }`}
                                title={`Unsettled: ${cb.unsettledTripsCount} trips (${Math.round(
                                  (cb.unsettledTripsCount / cb.totalTripsCount) * 100
                                )}%)`}
                              />
                            )}
                          </div>
                        ) : (
                          <div className="w-full h-2 bg-zinc-900 rounded-full border border-zinc-800/80 flex items-center justify-center">
                            <span className="text-[9px] text-zinc-600 font-mono">No trips logged</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                          <span>
                            {cb.totalTripsCount > 0
                              ? `${Math.round((cb.settledTripsCount / cb.totalTripsCount) * 100)}% Settled`
                              : '0% Ratio'}
                          </span>
                          <span>{cb.totalTripsCount} Total Trips</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <span className="text-[10px] text-amber-400 font-bold font-mono block">UNSETTLED DUE</span>
                          <span className="text-lg font-black text-white font-mono">
                            {formatCurrency(cb.unsettled, sym)}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setPaymentForm({
                              date: getTodayString(0),
                              collaboratorId: cb.id,
                              amount: cb.unsettled || 500,
                              referenceNote: `Payout for ${cb.name}`
                            });
                            setActiveModal('payment');
                          }}
                          className="bg-amber-500 hover:bg-amber-400 text-black font-bold py-1.5 px-3 rounded-lg text-xs flex items-center space-x-1 shadow-md shadow-amber-500/20 transition"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Pay {cb.name.split(' ')[0]}</span>
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Unsettled Trips Section */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono flex items-center justify-between">
                <span>
                  Pending Trips ({data.collabTrips.filter((ct) => !ct.settled && (selectedLedgerCollabId === 'all' || ct.collaboratorId === selectedLedgerCollabId)).length})
                </span>
                <span className="text-[10px] text-zinc-500 font-normal">Tap shift to mark settled</span>
              </h3>

              <div className="space-y-2">
                {data.collabTrips
                  .filter((ct) => !ct.settled && (selectedLedgerCollabId === 'all' || ct.collaboratorId === selectedLedgerCollabId))
                  .map((trip) => {
                    const cName = trip.collaboratorName || (data.collaborators || defaultCollaborators).find((col) => col.id === trip.collaboratorId)?.name || 'Collaborator';
                    return (
                      <div
                        key={trip.id}
                        className="bg-zinc-900 border border-amber-500/30 rounded-xl p-3 flex items-center justify-between transition hover:border-amber-500/60"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-white font-mono">
                              {formatDateReadable(trip.date)} • {trip.shift} Shift
                            </span>
                            <span className="text-[10px] bg-amber-950 text-amber-400 px-1.5 py-0.2 rounded font-mono border border-amber-800">
                              {cName}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400">{trip.notes || `${trip.tripsCount} trips recorded`}</p>
                        </div>

                        <div className="text-right flex items-center space-x-3">
                          <div>
                            <div className="text-sm font-bold text-amber-400 font-mono">
                              {formatCurrency(trip.totalAmount, sym)}
                            </div>
                            <div className="text-[10px] text-zinc-500 font-mono">
                              {trip.tripsCount} trips @ {sym}{trip.ratePerTrip}
                            </div>
                          </div>
                          <button
                            onClick={() => handleToggleCollabSettled(trip.id)}
                            className="bg-zinc-800 hover:bg-emerald-950 hover:text-emerald-400 text-zinc-300 p-2 rounded-lg border border-zinc-700 transition"
                            title="Mark as Settled"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => requestDelete(trip.id, 'collab', `Delete Collab Trip`)}
                            className="bg-zinc-800 hover:bg-rose-950 hover:text-rose-400 text-zinc-400 p-2 rounded-lg border border-zinc-700 transition"
                            title="Delete Trip"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                {data.collabTrips.filter((ct) => !ct.settled && (selectedLedgerCollabId === 'all' || ct.collaboratorId === selectedLedgerCollabId)).length === 0 && (
                  <div className="bg-zinc-900 border border-emerald-800/40 rounded-xl p-6 text-center text-emerald-400 text-xs font-mono space-y-1">
                    <ShieldCheck className="w-8 h-8 mx-auto text-emerald-400" />
                    <p className="font-bold">No pending unsettled trips for this collaborator selection!</p>
                  </div>
                )}
              </div>
            </div>

            {/* Payout Received History Ledger */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">
                Payout History ({data.paymentsReceived.filter((pr) => selectedLedgerCollabId === 'all' || pr.collaboratorId === selectedLedgerCollabId).length})
              </h3>

              <div className="space-y-2">
                {data.paymentsReceived
                  .filter((pr) => selectedLedgerCollabId === 'all' || pr.collaboratorId === selectedLedgerCollabId)
                  .map((pr) => {
                    const cName = pr.collaboratorName || (data.collaborators || defaultCollaborators).find((col) => col.id === pr.collaboratorId)?.name || 'Collaborator';
                    return (
                      <div
                        key={pr.id}
                        className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                            <DollarSign className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white font-mono flex items-center space-x-2">
                              <span>{formatCurrency(pr.amount, sym)} Received</span>
                              <span className="text-[10px] bg-emerald-950 text-emerald-400 px-1.5 py-0.2 rounded font-mono border border-emerald-800">
                                {cName}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-400">{pr.referenceNote || 'Payout settlement'}</p>
                            <p className="text-[10px] text-zinc-500 font-mono">{formatDateReadable(pr.date)}</p>
                          </div>
                        </div>

                        <button
                          onClick={() => requestDelete(pr.id, 'payment', `Delete Payout`)}
                          className="text-zinc-600 hover:text-rose-400 p-1.5 hover:bg-rose-500/10 rounded-lg transition"
                          title="Delete payment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}

                {data.paymentsReceived.filter((pr) => selectedLedgerCollabId === 'all' || pr.collaboratorId === selectedLedgerCollabId).length === 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-zinc-500 text-xs">
                    No collaborator payouts recorded for this selection yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* VIEW 4: ANALYTICS & REVIEWS               */}
        {/* ========================================== */}
        {activeTab === 'analytics' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-yellow-400 font-mono tracking-wider flex items-center space-x-2">
                <BarChart3 className="w-5 h-5" />
                <span>OPERATIONAL ANALYTICS</span>
              </h2>
              <span className="text-xs text-zinc-400 font-mono">
                {selectedDateFilter.replace('_', ' ').toUpperCase()}
              </span>
            </div>

            {/* Grid layout for Desktop / Tablet */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left Column: Revenue Breakdown & Efficiency Metrics & Utilities */}
              <div className="space-y-4">
                {/* Revenue Comparison: Primary vs Private */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono flex items-center justify-between">
                    <span>Revenue Source Breakdown</span>
                    <span className="text-yellow-400 font-mono">{formatCurrency(filteredSummary.grossRevenue, sym)}</span>
                  </h3>

                  {/* Progress visual bar */}
                  <div className="space-y-1.5">
                    <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden flex">
                      <div
                        className="bg-yellow-500 h-full transition-all duration-500"
                        style={{
                          width: `${filteredSummary.grossRevenue > 0 ? (filteredSummary.collabRev / filteredSummary.grossRevenue) * 100 : 50}%`
                        }}
                      ></div>
                      <div
                        className="bg-cyan-400 h-full transition-all duration-500"
                        style={{
                          width: `${filteredSummary.grossRevenue > 0 ? (filteredSummary.privateRev / filteredSummary.grossRevenue) * 100 : 50}%`
                        }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center space-x-1 text-yellow-400">
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
                        <span>Collab: {formatCurrency(filteredSummary.collabRev, sym)} ({filteredSummary.grossRevenue > 0 ? Math.round((filteredSummary.collabRev / filteredSummary.grossRevenue) * 100) : 0}%)</span>
                      </div>
                      <div className="flex items-center space-x-1 text-cyan-400">
                        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400"></div>
                        <span>Private: {formatCurrency(filteredSummary.privateRev, sym)} ({filteredSummary.grossRevenue > 0 ? Math.round((filteredSummary.privateRev / filteredSummary.grossRevenue) * 100) : 0}%)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Key Operational Efficiency Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-1">
                    <span className="text-[10px] text-zinc-400 font-mono uppercase">Avg Revenue / Trip</span>
                    <div className="text-lg font-black text-white font-mono">
                      {formatCurrency(filteredSummary.avgRevenuePerTrip, sym)}
                    </div>
                    <p className="text-[10px] text-zinc-500">Across {filteredSummary.totalTrips} trips</p>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-1">
                    <span className="text-[10px] text-zinc-400 font-mono uppercase">Fuel Cost Ratio</span>
                    <div className="text-lg font-black text-amber-400 font-mono">
                      {Math.round(filteredSummary.fuelCostRatio)}%
                    </div>
                    <p className="text-[10px] text-zinc-500">Of gross revenue spent on fuel</p>
                  </div>
                </div>

                {/* DATA BACKUP & RESET CONTROLS */}
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-3">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-mono">
                    Data Backup & Utility
                  </h3>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      onClick={handleExportData}
                      className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2 px-3 rounded-lg flex items-center justify-center space-x-1.5 border border-zinc-700 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export JSON</span>
                    </button>

                    <label className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2 px-3 rounded-lg flex items-center justify-center space-x-1.5 border border-zinc-700 transition cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Import Backup</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportData}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <button
                    onClick={handleResetData}
                    className="w-full bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 py-2 px-3 rounded-lg text-xs flex items-center justify-center space-x-1.5 border border-rose-800/50 transition font-mono"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset to Sample Data</span>
                  </button>
                </div>
              </div>

              {/* Right Column: Profit & Loss Statement Breakdown */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3 h-fit">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">
                  P&L Statement ({selectedDateFilter.replace('_', ' ')})
                </h3>

                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between py-1 border-b border-zinc-800 text-zinc-300">
                    <span>Gross Primary Collab Earnings</span>
                    <span className="text-white">{formatCurrency(filteredSummary.collabRev, sym)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-800 text-zinc-300">
                    <span>Gross Private Trip Earnings</span>
                    <span className="text-white">{formatCurrency(filteredSummary.privateRev, sym)}</span>
                  </div>
                  <div className="flex justify-between py-1 font-bold text-yellow-400 border-b border-zinc-700">
                    <span>TOTAL GROSS REVENUE</span>
                    <span>{formatCurrency(filteredSummary.grossRevenue, sym)}</span>
                  </div>

                  <div className="pt-2 text-[11px] text-zinc-500 uppercase font-bold">OPERATIONAL EXPENSES</div>
                  <div className="flex justify-between py-1 border-b border-zinc-800 text-zinc-400">
                    <span>Fuel (Diesel) Total</span>
                    <span className="text-rose-400">-{formatCurrency(filteredSummary.totalFuel, sym)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-800 text-zinc-400">
                    <span>Driver Pay & Allowance</span>
                    <span className="text-rose-400">-{formatCurrency(filteredSummary.totalDriverPay, sym)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-800 text-zinc-400">
                    <span>Servicing & Parts</span>
                    <span className="text-rose-400">-{formatCurrency(filteredSummary.totalServicing, sym)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-800 text-zinc-400">
                    <span>Tolls & Highway Charges</span>
                    <span className="text-rose-400">-{formatCurrency(filteredSummary.totalTolls, sym)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-800 text-zinc-400">
                    <span>Miscellaneous</span>
                    <span className="text-rose-400">-{formatCurrency(filteredSummary.totalMisc, sym)}</span>
                  </div>

                  <div className="flex justify-between py-2 text-sm font-black text-emerald-400 border-t border-yellow-500/30 pt-2">
                    <span>NET OPERATING PROFIT</span>
                    <span>{formatCurrency(filteredSummary.netProfit, sym)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ========================================== */}
      {/* FLOATING ACTION BUTTON (FAB) & SPEED DIAL  */}
      {/* ========================================== */}
      <div className="fixed bottom-20 right-5 z-40">
        {/* Speed Dial Menu Items */}
        {isFabOpen && (
          <div className="mb-3 space-y-2 animate-in slide-in-from-bottom-5 fade-in duration-200 flex flex-col items-end">
            <button
              onClick={() => {
                setIsFabOpen(false);
                setEditingId(null);
                const currentCollab = collaboratorsList.find((c) => c.id === collabForm.collaboratorId) || collaboratorsList[0];
                if (currentCollab) {
                  setCollabForm((prev) => ({
                    ...prev,
                    collaboratorId: currentCollab.id,
                    ratePerTrip: currentCollab.defaultRate !== undefined ? currentCollab.defaultRate : prev.ratePerTrip,
                    fuelExpense: 0,
                    driverPay: 0
                  }));
                }
                setActiveModal('collab');
              }}
              className="bg-zinc-900 hover:bg-zinc-800 text-zinc-100 font-medium py-2 px-3.5 rounded-xl shadow-xl border border-zinc-800 flex items-center space-x-2.5 text-xs transition group"
            >
              <span>Log Collab Trip</span>
              <span className="bg-amber-400 text-zinc-950 p-1.5 rounded-lg">
                <Truck className="w-4 h-4" />
              </span>
            </button>

            <button
              onClick={() => {
                setIsFabOpen(false);
                setEditingId(null);
                setActiveModal('private');
              }}
              className="bg-zinc-900 hover:bg-zinc-800 text-zinc-100 font-medium py-2 px-3.5 rounded-xl shadow-xl border border-zinc-800 flex items-center space-x-2.5 text-xs transition group"
            >
              <span>Log Private Trip</span>
              <span className="bg-emerald-400 text-zinc-950 p-1.5 rounded-lg">
                <Briefcase className="w-4 h-4" />
              </span>
            </button>

            <button
              onClick={() => {
                setIsFabOpen(false);
                setEditingId(null);
                setActiveModal('expense');
              }}
              className="bg-zinc-900 hover:bg-zinc-800 text-zinc-100 font-medium py-2 px-3.5 rounded-xl shadow-xl border border-zinc-800 flex items-center space-x-2.5 text-xs transition group"
            >
              <span>Add Expense</span>
              <span className="bg-rose-400 text-zinc-950 p-1.5 rounded-lg">
                <Fuel className="w-4 h-4" />
              </span>
            </button>

            <button
              onClick={() => {
                setIsFabOpen(false);
                setEditingId(null);
                setPaymentForm((p) => ({ ...p, amount: unsettledCollabBalance || 500 }));
                setActiveModal('payment');
              }}
              className="bg-zinc-900 hover:bg-zinc-800 text-zinc-100 font-medium py-2 px-3.5 rounded-xl shadow-xl border border-zinc-800 flex items-center space-x-2.5 text-xs transition group"
            >
              <span>Record Payment Received</span>
              <span className="bg-amber-400 text-zinc-950 p-1.5 rounded-lg">
                <DollarSign className="w-4 h-4" />
              </span>
            </button>
          </div>
        )}

        {/* Minimalist Floating Action Button */}
        <button
          onClick={() => setIsFabOpen(!isFabOpen)}
          className={`w-14 h-14 rounded-2xl bg-amber-400 hover:bg-amber-300 text-zinc-950 flex items-center justify-center shadow-lg transition-transform active:scale-95 border border-amber-300 ${
            isFabOpen ? 'rotate-45 bg-zinc-800 text-amber-400 border-zinc-700' : ''
          }`}
          title="Quick Entry Menu"
        >
          <Plus className="w-7 h-7 stroke-[2.5]" />
        </button>
      </div>

      {/* FAB Backdrop overlay */}
      {isFabOpen && (
        <div
          onClick={() => setIsFabOpen(false)}
          className="fixed inset-0 bg-zinc-950/80 backdrop-blur-xs z-30 animate-in fade-in duration-150"
        ></div>
      )}

      {/* ========================================== */}
      {/* BOTTOM NAVIGATION TAB BAR                  */}
      {/* ========================================== */}
      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/80 z-30 px-3 py-2">
        <div className="max-w-md md:max-w-xl mx-auto grid grid-cols-4 gap-2">
          {[
            { id: 'dashboard', label: 'Overview', icon: PieChart },
            { id: 'logs', label: 'Trips/Logs', icon: FileText },
            { id: 'ledger', label: 'Ledger', icon: Receipt },
            { id: 'analytics', label: 'Reviews', icon: BarChart3 }
          ].map((tab) => {
            const IconComponent = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition ${
                  isActive
                    ? 'text-amber-400 font-bold bg-amber-400/10'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <IconComponent className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
                <span className="text-[10px] mt-1 uppercase font-bold tracking-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ========================================== */}
      {/* MODAL 1: COLLABORATOR TRIP LOGGER          */}
      {/* ========================================== */}
      {activeModal === 'collab' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-yellow-500/40 rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2 text-yellow-400 font-mono font-bold text-base">
                <Truck className="w-5 h-5" />
                <span>{editingId ? 'EDIT COLLABORATOR TRIP' : 'LOG COLLABORATOR TRIP'}</span>
              </div>
              <button
                onClick={() => {
                  setActiveModal(null);
                  setEditingId(null);
                }}
                className="text-zinc-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCollabTrip} className="space-y-4 text-xs font-mono">
              {/* Collaborator Selection Dropdown */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-amber-400 font-bold flex items-center space-x-1">
                    <Users className="w-3.5 h-3.5" />
                    <span>Select Collaborator / Client</span>
                  </label>
                  <div className="flex items-center space-x-2">
                    {collabForm.collaboratorId && (
                      <button
                        type="button"
                        onClick={() => {
                          const c = (data.collaborators || []).find((col) => col.id === collabForm.collaboratorId);
                          if (c) handleEditCollaborator(c);
                        }}
                        className="text-[10px] text-amber-400 hover:underline flex items-center space-x-1 font-bold"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCollabId(null);
                        setNewCollabForm({ name: '', phone: '', defaultRate: 600, notes: '' });
                        setShowAddCollabModal(true);
                      }}
                      className="text-[10px] text-amber-400 hover:underline font-bold"
                    >
                      + Add New
                    </button>
                  </div>
                </div>
                {collaboratorsList.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowAddCollabModal(true)}
                    className="w-full bg-amber-500/10 border border-amber-500/40 text-amber-400 rounded-lg p-2.5 font-bold hover:bg-amber-500/20 text-center flex items-center justify-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>No Collaborator Found. Click to Add One</span>
                  </button>
                ) : (
                  <select
                    value={collabForm.collaboratorId}
                    onChange={(e) => {
                      const cId = e.target.value;
                      const selectedCol = collaboratorsList.find((c) => c.id === cId);
                      setCollabForm({
                        ...collabForm,
                        collaboratorId: cId,
                        ratePerTrip: selectedCol?.defaultRate !== undefined ? selectedCol.defaultRate : collabForm.ratePerTrip
                      });
                    }}
                    className="w-full bg-zinc-950 border border-amber-500/50 rounded-lg p-2.5 text-white font-bold focus:border-yellow-500"
                  >
                    {collaboratorsList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({sym}{c.defaultRate}/trip)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={collabForm.date}
                    onChange={(e) => setCollabForm({ ...collabForm, date: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-yellow-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Shift Type</label>
                  <select
                    value={collabForm.shift}
                    onChange={(e) => setCollabForm({ ...collabForm, shift: e.target.value as any })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-yellow-500"
                  >
                    <option value="Day">Day Shift</option>
                    <option value="Night">Night Shift</option>
                    <option value="Full">Full Day Shift</option>
                  </select>
                </div>
              </div>

              {/* Touch Counter for Trips Count */}
              <div>
                <label className="block text-zinc-400 mb-1">Trips Completed Today</label>
                <div className="flex items-center space-x-3 bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                  <button
                    type="button"
                    onClick={() =>
                      setCollabForm((p) => ({ ...p, tripsCount: Math.max(1, p.tripsCount - 1) }))
                    }
                    className="bg-zinc-800 text-yellow-400 w-10 h-10 rounded-lg font-black text-lg flex items-center justify-center hover:bg-zinc-700 active:scale-95 transition"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={collabForm.tripsCount}
                    onChange={(e) =>
                      setCollabForm({ ...collabForm, tripsCount: Math.max(1, parseInt(e.target.value) || 1) })
                    }
                    className="flex-1 bg-transparent text-center text-xl font-bold text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setCollabForm((p) => ({ ...p, tripsCount: p.tripsCount + 1 }))}
                    className="bg-zinc-800 text-yellow-400 w-10 h-10 rounded-lg font-black text-lg flex items-center justify-center hover:bg-zinc-700 active:scale-95 transition"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Rate Per Trip ({sym})</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={collabForm.ratePerTrip}
                  onChange={(e) =>
                    setCollabForm({
                      ...collabForm,
                      ratePerTrip: e.target.value === '' ? '' : Number(e.target.value)
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-yellow-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={collabForm.notes}
                  onChange={(e) => setCollabForm({ ...collabForm, notes: e.target.value })}
                  placeholder="e.g. 6 loads gravel, driver remarks..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-yellow-500"
                ></textarea>
              </div>

              {/* Side-by-side Loading-point and Unloading-point */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Loading-point</label>
                  <input
                    type="text"
                    value={collabForm.loadingPoint}
                    onChange={(e) => setCollabForm({ ...collabForm, loadingPoint: e.target.value })}
                    placeholder="Kucharam-Loading point"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-yellow-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Unloading-point</label>
                  <input
                    type="text"
                    value={collabForm.unloadingPoint}
                    onChange={(e) => setCollabForm({ ...collabForm, unloadingPoint: e.target.value })}
                    placeholder="e.g. Unloading Site / Customer Yard"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-yellow-500"
                  />
                </div>
              </div>

              {/* Calculated Summary Box */}
              <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-zinc-400">TOTAL REVENUE RECORDED</span>
                  <div className="text-lg font-bold text-yellow-400">
                    {formatCurrency(
                      collabForm.tripsCount * (collabForm.ratePerTrip === '' ? 0 : Number(collabForm.ratePerTrip)),
                      sym
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-zinc-400">NET TRIP MARGIN</span>
                  <div className="text-lg font-bold text-emerald-400">
                    {formatCurrency(
                      collabForm.tripsCount * (collabForm.ratePerTrip === '' ? 0 : Number(collabForm.ratePerTrip)),
                      sym
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-1 border-t border-zinc-800">
                <button
                  type="submit"
                  className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-yellow-500/20 flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  <span>{editingId ? 'Update Trip Log' : 'Save Collab Trip Log'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 2: PRIVATE TRIP LOGGER               */}
      {/* ========================================== */}
      {activeModal === 'private' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-cyan-500/40 rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2 text-cyan-400 font-mono font-bold text-base">
                <Briefcase className="w-5 h-5" />
                <span>{editingId ? 'EDIT PRIVATE TRIP' : 'LOG PRIVATE TRIP'}</span>
              </div>
              <button
                onClick={() => {
                  setActiveModal(null);
                  setEditingId(null);
                }}
                className="text-zinc-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePrivateTrip} className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={privateForm.date}
                    onChange={(e) => setPrivateForm({ ...privateForm, date: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Payment Status</label>
                  <select
                    value={privateForm.paymentStatus}
                    onChange={(e) =>
                      setPrivateForm({ ...privateForm, paymentStatus: e.target.value as any })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-cyan-500"
                  >
                    <option value="Cash">Paid via Cash</option>
                    <option value="UPI">Paid via UPI / Bank</option>
                    <option value="Pending Credit">Pending Credit</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Customer / Site Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Metro Builders Plot #4"
                  value={privateForm.customerName}
                  onChange={(e) => setPrivateForm({ ...privateForm, customerName: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-cyan-500"
                />
              </div>

              {/* Touch Counter for Private Trips */}
              <div>
                <label className="block text-zinc-400 mb-1">Trips Count</label>
                <div className="flex items-center space-x-3 bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                  <button
                    type="button"
                    onClick={() =>
                      setPrivateForm((p) => ({ ...p, tripsCount: Math.max(1, p.tripsCount - 1) }))
                    }
                    className="bg-zinc-800 text-cyan-400 w-10 h-10 rounded-lg font-black text-lg flex items-center justify-center hover:bg-zinc-700 active:scale-95 transition"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={privateForm.tripsCount}
                    onChange={(e) =>
                      setPrivateForm({ ...privateForm, tripsCount: Math.max(1, parseInt(e.target.value) || 1) })
                    }
                    className="flex-1 bg-transparent text-center text-xl font-bold text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setPrivateForm((p) => ({ ...p, tripsCount: p.tripsCount + 1 }))}
                    className="bg-zinc-800 text-cyan-400 w-10 h-10 rounded-lg font-black text-lg flex items-center justify-center hover:bg-zinc-700 active:scale-95 transition"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Rate Per Trip ({sym})</label>
                  <input
                    type="number"
                    required
                    value={privateForm.ratePerTrip}
                    onChange={(e) =>
                      setPrivateForm({ ...privateForm, ratePerTrip: Number(e.target.value) || 0 })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Extra Fuel Cost ({sym})</label>
                  <input
                    type="number"
                    value={privateForm.extraFuelCost}
                    onChange={(e) =>
                      setPrivateForm({ ...privateForm, extraFuelCost: Number(e.target.value) || 0 })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={privateForm.notes}
                  onChange={(e) => setPrivateForm({ ...privateForm, notes: e.target.value })}
                  placeholder="Additional details..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-cyan-500"
                ></textarea>
              </div>

              {/* Total Summary Box */}
              <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-zinc-400">TOTAL PRIVATE REVENUE</span>
                  <div className="text-lg font-bold text-cyan-400">
                    {formatCurrency(privateForm.tripsCount * privateForm.ratePerTrip, sym)}
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-1 border-t border-zinc-800">
                <button
                  type="submit"
                  className="w-full bg-cyan-400 hover:bg-cyan-300 text-black font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-cyan-500/20 flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  <span>{editingId ? 'Update Private Trip Log' : 'Save Private Trip Log'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 3: EXPENSE LOGGER                    */}
      {/* ========================================== */}
      {activeModal === 'expense' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-rose-500/40 rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2 text-rose-400 font-mono font-bold text-base">
                <Fuel className="w-5 h-5" />
                <span>{editingId ? 'EDIT OPERATIONAL EXPENSE' : 'ADD OPERATIONAL EXPENSE'}</span>
              </div>
              <button
                onClick={() => {
                  setActiveModal(null);
                  setEditingId(null);
                }}
                className="text-zinc-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={expenseForm.date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Category</label>
                  <select
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value as any })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-rose-500"
                  >
                    <option value="Fuel">Fuel (Diesel)</option>
                    <option value="Driver Pay">Driver Allowance/Pay</option>
                    <option value="Toll">Toll & Expressway</option>
                    <option value="Servicing/Parts">Servicing & Maintenance</option>
                    <option value="Misc">Miscellaneous</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Amount ({sym})</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={expenseForm.amount}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, amount: Number(e.target.value) || 0 })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white text-lg font-bold focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Notes / Receipt Ref</label>
                <textarea
                  rows={2}
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                  placeholder="e.g. 50 Liters Diesel refuel at Shell station"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-rose-500"
                ></textarea>
              </div>

              <div className="space-y-2 pt-1 border-t border-zinc-800">
                <button
                  type="submit"
                  className="w-full bg-rose-500 hover:bg-rose-400 text-white font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-rose-500/20"
                >
                  {editingId ? 'Update Operational Expense' : 'Save Operational Expense'}
                </button>


              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 4: RECORD PAYMENT RECEIVED           */}
      {/* ========================================== */}
      {activeModal === 'payment' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-emerald-500/40 rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2 text-emerald-400 font-mono font-bold text-base">
                <DollarSign className="w-5 h-5" />
                <span>{editingId ? 'EDIT COLLABORATOR PAYOUT' : 'RECORD COLLABORATOR PAYOUT'}</span>
              </div>
              <button
                onClick={() => {
                  setActiveModal(null);
                  setEditingId(null);
                }}
                className="text-zinc-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="space-y-4 text-xs font-mono">
              {/* Collaborator Selection Dropdown */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-emerald-400 font-bold flex items-center space-x-1">
                    <Users className="w-3.5 h-3.5" />
                    <span>Select Collaborator</span>
                  </label>
                  <div className="flex items-center space-x-2">
                    {paymentForm.collaboratorId && (
                      <button
                        type="button"
                        onClick={() => {
                          const c = (data.collaborators || []).find((col) => col.id === paymentForm.collaboratorId);
                          if (c) handleEditCollaborator(c);
                        }}
                        className="text-[10px] text-emerald-400 hover:underline flex items-center space-x-1 font-bold"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>Edit</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCollabId(null);
                        setNewCollabForm({ name: '', phone: '', defaultRate: 600, notes: '' });
                        setShowAddCollabModal(true);
                      }}
                      className="text-[10px] text-emerald-400 hover:underline font-bold"
                    >
                      + Add New
                    </button>
                  </div>
                </div>
                {collaboratorBalances.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowAddCollabModal(true)}
                    className="w-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 rounded-lg p-2.5 font-bold hover:bg-emerald-500/20 text-center flex items-center justify-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>No Collaborator Found. Click to Add One</span>
                  </button>
                ) : (
                  <select
                    value={paymentForm.collaboratorId}
                    onChange={(e) => {
                      const cId = e.target.value;
                      const cBal = collaboratorBalances.find((cb) => cb.id === cId);
                      setPaymentForm({
                        ...paymentForm,
                        collaboratorId: cId,
                        amount: cBal?.unsettled || paymentForm.amount
                      });
                    }}
                    className="w-full bg-zinc-950 border border-emerald-500/50 rounded-lg p-2.5 text-white font-bold focus:border-emerald-500"
                  >
                    {collaboratorBalances.map((cb) => (
                      <option key={cb.id} value={cb.id}>
                        {cb.name} ({formatCurrency(cb.unsettled, sym)} due)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Payment Date</label>
                <input
                  type="date"
                  required
                  value={paymentForm.date}
                  onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Amount Received ({sym})</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={paymentForm.amount}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, amount: Number(e.target.value) || 0 })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-emerald-400 text-xl font-bold focus:border-emerald-500"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Current Unsettled Balance Owed: <strong className="text-amber-400">{formatCurrency(unsettledCollabBalance, sym)}</strong>
                </p>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Transaction Ref / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Bank Transfer #TXN99201"
                  value={paymentForm.referenceNote}
                  onChange={(e) => setPaymentForm({ ...paymentForm, referenceNote: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-emerald-500/20"
              >
                {editingId ? 'Update Payout Record' : 'Record Payout Received'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 5: SETTINGS & MENU (GROUPED LIST)   */}
      {/* ========================================== */}
      {activeModal === 'settings' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl sm:rounded-3xl w-full max-w-2xl p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div className="flex items-center space-x-2 text-amber-400 font-mono font-bold text-sm sm:text-base">
                <Settings className="w-5 h-5 text-amber-400" />
                <span>TIPPERLOG MENU & SETTINGS</span>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="text-zinc-400 hover:text-white p-1.5 rounded-xl hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Segmented Sub-Tab Switcher Bar */}
            <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800/80 text-xs font-mono">
              <button
                type="button"
                onClick={() => setSettingsTab('menu')}
                className={`flex-1 py-1.5 rounded-lg font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  settingsTab === 'menu'
                    ? 'bg-amber-400 text-black shadow-xs font-extrabold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Menu</span>
              </button>
              <button
                type="button"
                onClick={() => setSettingsTab('general')}
                className={`flex-1 py-1.5 rounded-lg font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  settingsTab === 'general'
                    ? 'bg-amber-400 text-black shadow-xs font-extrabold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Profile</span>
              </button>
              <button
                type="button"
                onClick={() => setSettingsTab('pending_rates')}
                className={`flex-1 py-1.5 rounded-lg font-bold transition flex items-center justify-center gap-1.5 cursor-pointer relative ${
                  settingsTab === 'pending_rates'
                    ? 'bg-amber-400 text-black shadow-xs font-extrabold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Rates</span>
                {totalUnpricedTripsCount > 0 && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 text-[9px] font-extrabold rounded-full ${
                      settingsTab === 'pending_rates'
                        ? 'bg-black text-amber-400'
                        : 'bg-amber-500/30 text-amber-300'
                    }`}
                  >
                    {totalUnpricedTripsCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSettingsTab('admin')}
                className={`flex-1 py-1.5 rounded-lg font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  settingsTab === 'admin'
                    ? 'bg-amber-400 text-black shadow-xs font-extrabold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Admin</span>
              </button>
            </div>

            {/* ================================================== */}
            {/* VIEW 1: SLEEK DARK-MODE GROUPED LIST LAYOUT (MENU) */}
            {/* ================================================== */}
            {settingsTab === 'menu' && (
              <div className="space-y-4 font-mono text-xs animate-in fade-in duration-200">
                {/* Profile Hero Header Card (iOS/Instagram Profile Style) */}
                <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-zinc-800/90 rounded-2xl p-4 flex items-center justify-between shadow-md">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-amber-400 text-zinc-950 font-black text-base rounded-2xl flex items-center justify-center shadow-md shadow-amber-500/10 ring-2 ring-amber-400/20 shrink-0">
                      {(data.settings.ownerName || 'T').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-extrabold text-white text-sm tracking-tight">
                          {data.settings.ownerName || 'Fleet Owner'}
                        </h3>
                        <span className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[9px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Active
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center space-x-2">
                        <span>{data.settings.vehicleRegNo || 'No vehicle reg'}</span>
                        <span>•</span>
                        <span className="text-amber-400 font-bold">Default {sym}{data.settings.defaultCollabRate || 600}/trip</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettingsTab('general')}
                    className="bg-zinc-800 hover:bg-zinc-700 text-amber-400 text-[11px] font-bold px-3 py-1.5 rounded-xl border border-zinc-700/80 transition flex items-center space-x-1 cursor-pointer shrink-0"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span className="hidden sm:inline">Edit Profile</span>
                  </button>
                </div>

                {/* GROUP 1: ACCOUNT & FLEET PREFERENCES */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1 flex items-center space-x-1">
                    <User className="w-3 h-3 text-amber-400" />
                    <span>ACCOUNT & FLEET PREFERENCES</span>
                  </div>
                  <div className="bg-zinc-950 rounded-2xl border border-zinc-800/80 divide-y divide-zinc-800/60 overflow-hidden shadow-xs">
                    {/* Fleet Owner Profile */}
                    <button
                      type="button"
                      onClick={() => setSettingsTab('general')}
                      className="w-full p-3.5 transition flex items-center justify-between text-left hover:bg-zinc-900/80 cursor-pointer group"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20 group-hover:scale-105 transition-transform">
                          <User className="w-4 h-4 stroke-[2.5]" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">
                            Profile & Vehicle Details
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            Owner Name, Vehicle Reg No. & Default Collab Rates
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                    </button>
                  </div>
                </div>

                {/* GROUP 2: TRIP LOGS & RATE MANAGEMENT */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1 flex items-center space-x-1">
                    <Calculator className="w-3 h-3 text-amber-400" />
                    <span>TRIP LOGS & RATE MANAGEMENT</span>
                  </div>
                  <div className="bg-zinc-950 rounded-2xl border border-zinc-800/80 divide-y divide-zinc-800/60 overflow-hidden shadow-xs">
                    {/* Pending Trip Rates */}
                    <button
                      type="button"
                      onClick={() => setSettingsTab('pending_rates')}
                      className="w-full p-3.5 transition flex items-center justify-between text-left hover:bg-zinc-900/80 cursor-pointer group"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20 group-hover:scale-105 transition-transform">
                          <Calculator className="w-4 h-4 stroke-[2.5]" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">
                              Pending Trip Rates Manager
                            </span>
                            {totalUnpricedTripsCount > 0 && (
                              <span className="px-2 py-0.5 text-[9px] font-extrabold rounded-full bg-amber-400 text-black shadow-xs animate-pulse">
                                {totalUnpricedTripsCount} Pending
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            Batch assign rates to ₹0 unpriced daily trips
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                    </button>

                    {/* Admin Trip Editor */}
                    <button
                      type="button"
                      onClick={() => setSettingsTab('admin')}
                      className="w-full p-3.5 transition flex items-center justify-between text-left hover:bg-zinc-900/80 cursor-pointer group"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20 group-hover:scale-105 transition-transform">
                          <Lock className="w-4 h-4 stroke-[2.5]" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">
                              Admin Trip Management Panel
                            </span>
                            <span className="px-2 py-0.5 text-[9px] font-bold rounded-md bg-zinc-900 text-zinc-400 border border-zinc-800">
                              {(data.collabTrips || []).length + (data.privateTrips || []).length} Logged
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            Search, filter, edit or remove recorded logs & payouts
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                    </button>
                  </div>
                </div>

                {/* GROUP 3: DATA BACKUP & PRINTABLE REPORTS */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1 flex items-center space-x-1">
                    <Database className="w-3 h-3 text-amber-400" />
                    <span>DATA BACKUP & PRINTABLE REPORTS</span>
                  </div>
                  <div className="bg-zinc-950 rounded-2xl border border-zinc-800/80 divide-y divide-zinc-800/60 overflow-hidden shadow-xs">
                    {/* Supabase Sync */}
                    <button
                      type="button"
                      onClick={() => setShowSupabaseModal(true)}
                      className="w-full p-3.5 transition flex items-center justify-between text-left hover:bg-zinc-900/80 cursor-pointer group"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition-transform">
                          <Database className="w-4 h-4 stroke-[2.5]" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">
                              Cloud Database & Sync
                            </span>
                            <span className="px-2 py-0.5 text-[9px] font-extrabold rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                              Synced
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            Real-time Supabase cloud database backup & auth
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                    </button>

                    {/* PDF Report Export */}
                    <button
                      type="button"
                      onClick={() => setShowPdfReportModal(true)}
                      className="w-full p-3.5 transition flex items-center justify-between text-left hover:bg-zinc-900/80 cursor-pointer group"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20 group-hover:scale-105 transition-transform">
                          <Printer className="w-4 h-4 stroke-[2.5]" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">
                            Export Printable PDF Accounting Ledger
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            Generate print-ready statements for clients & collaborators
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                    </button>

                    {/* JSON Offline Backup & Restore */}
                    <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl bg-zinc-900 text-zinc-300 border border-zinc-800">
                          <Download className="w-4 h-4 stroke-[2.5]" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">
                            JSON Backup & Local Storage
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            Download offline copy or restore data from file
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleExportData}
                          className="bg-zinc-900 hover:bg-zinc-800 text-amber-400 text-[11px] font-bold px-3 py-1.5 rounded-xl border border-zinc-700/80 transition cursor-pointer flex items-center space-x-1"
                        >
                          <Download className="w-3 h-3" />
                          <span>Export</span>
                        </button>
                        <label className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[11px] font-bold px-3 py-1.5 rounded-xl border border-zinc-700/80 transition cursor-pointer flex items-center space-x-1">
                          <Upload className="w-3 h-3 text-amber-400" />
                          <span>Import</span>
                          <input
                            type="file"
                            accept=".json"
                            onChange={handleImportData}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* GROUP 4: SESSION & SECURITY */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1 flex items-center space-x-1">
                    <ShieldCheck className="w-3 h-3 text-amber-400" />
                    <span>SESSION & SECURITY</span>
                  </div>
                  <div className="bg-zinc-950 rounded-2xl border border-zinc-800/80 divide-y divide-zinc-800/60 overflow-hidden shadow-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModal(null);
                        handleSignOut();
                      }}
                      className="w-full p-3.5 transition flex items-center justify-between text-left hover:bg-rose-500/10 cursor-pointer group"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/20 group-hover:scale-105 transition-transform">
                          <LogOut className="w-4 h-4 stroke-[2.5]" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-rose-400 group-hover:text-rose-300 transition-colors">
                            Lock App & Sign Out
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            End current active session and lock application
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-rose-500/60 group-hover:text-rose-400 transition-colors" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-view Back Button when viewing Profile / Rates / Admin */}
            {settingsTab !== 'menu' && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setSettingsTab('menu')}
                  className="mb-3 text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center space-x-1.5 bg-zinc-950 hover:bg-zinc-800/80 px-3 py-1.5 rounded-xl border border-zinc-800 transition cursor-pointer w-fit"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  <span>Back to Settings Menu</span>
                </button>
              </div>
            )}

            {settingsTab === 'general' && (
              <form onSubmit={handleSaveSettings} className="space-y-4 text-xs font-mono">
                <div>
                  <label className="block text-zinc-400 mb-1">Owner / Fleet Name</label>
                  <input
                    type="text"
                    value={settingsForm.ownerName}
                    onChange={(e) => setSettingsForm({ ...settingsForm, ownerName: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-yellow-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Vehicle Registration No.</label>
                  <input
                    type="text"
                    value={settingsForm.vehicleRegNo}
                    onChange={(e) => setSettingsForm({ ...settingsForm, vehicleRegNo: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-yellow-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Default Collab Rate per Trip ({sym})</label>
                  <input
                    type="number"
                    required
                    value={settingsForm.defaultCollabRate}
                    onChange={(e) => setSettingsForm({ ...settingsForm, defaultCollabRate: Number(e.target.value) || 0 })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-yellow-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-yellow-500/20"
                >
                  Save Profile Settings
                </button>

                <div className="pt-3 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModal(null);
                      handleSignOut();
                    }}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-rose-400 font-bold py-2.5 rounded-xl transition flex items-center justify-center space-x-2 border border-zinc-700"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Lock App & Sign Out</span>
                  </button>
                </div>
              </form>
            )}

            {/* PENDING RATES MANAGER SUB-TAB */}
            {settingsTab === 'pending_rates' && (
              <div className="space-y-4 font-mono text-xs">
                {/* Info Header Banner */}
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 flex items-start space-x-2.5">
                  <Calculator className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-amber-400 font-bold">PENDING TRIP RATES MANAGER</strong>
                    <span className="text-[11px] text-zinc-300">
                      Daily trips recorded with ₹0 rate per trip need pricing. Select a date below to batch assign rates to matching routes.
                    </span>
                  </div>
                </div>

                {/* Date Picker & Quick Date Selector */}
                <div className="space-y-2 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-bold text-zinc-300 flex items-center space-x-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-400" />
                      <span>Select Date for Pending Rates:</span>
                    </label>
                    <input
                      type="date"
                      value={pendingRatesSelectedDate}
                      onChange={(e) => setPendingRatesSelectedDate(e.target.value)}
                      className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:border-amber-400 focus:outline-hidden"
                    />
                  </div>

                  {/* Quick Date Chips */}
                  {pendingRateDates.length > 0 && (
                    <div className="pt-2 border-t border-zinc-800/80">
                      <div className="text-[10px] text-zinc-500 mb-1.5 font-bold uppercase tracking-wider">
                        Dates with Unpriced Trips ({pendingRateDates.length}):
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {pendingRateDates.map((d) => {
                          const unpricedCountOnDate =
                            (data.collabTrips || []).filter((t) => t.date === d && Number(t.ratePerTrip || 0) === 0).length +
                            (data.privateTrips || []).filter((t) => t.date === d && Number(t.ratePerTrip || 0) === 0).length;
                          const isSelected = pendingRatesSelectedDate === d;
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setPendingRatesSelectedDate(d)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-400 text-black shadow-xs'
                                  : 'bg-zinc-900 text-zinc-300 border border-zinc-800 hover:border-amber-500/50'
                              }`}
                            >
                              <span>{formatDateReadable(d)}</span>
                              <span
                                className={`px-1.5 py-0.2 text-[9px] rounded-full font-extrabold ${
                                  isSelected ? 'bg-black text-amber-400' : 'bg-amber-500/20 text-amber-400'
                                }`}
                              >
                                {unpricedCountOnDate}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Route Cards List for Selected Date */}
                {pendingRouteGroups.length === 0 ? (
                  <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 text-center space-y-2">
                    <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-bold text-white">All Trips Fully Priced!</div>
                    <div className="text-[11px] text-zinc-400">
                      There are no ₹0 unpriced trip records on {formatDateReadable(pendingRatesSelectedDate)}.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-zinc-400 flex items-center justify-between">
                      <span>Unpriced Routes for {formatDateReadable(pendingRatesSelectedDate)}</span>
                      <span className="text-amber-400 text-[11px] font-extrabold">{pendingRouteGroups.length} Route Group(s)</span>
                    </div>

                    {pendingRouteGroups.map((group) => {
                      const rateVal = pendingRateInputs[group.key] !== undefined ? pendingRateInputs[group.key] : '';
                      const numRate = Number(rateVal) || 0;
                      const calculatedTotal = group.tripsCount * numRate;

                      return (
                        <div
                          key={group.key}
                          className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 space-y-3 transition"
                        >
                          {/* Route header syntax format: [ Loading-point ] ➔ [ Unloading-point ] */}
                          <div className="bg-amber-500/10 border border-amber-500/25 px-3 py-2.5 rounded-lg flex items-center justify-between">
                            <div className="text-xs font-mono font-extrabold text-amber-400 flex items-center space-x-1.5 flex-wrap">
                              <span>[ {group.loadingPoint} ]</span>
                              <span className="text-amber-300">➔</span>
                              <span>[ {group.unloadingPoint} ]</span>
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-300 shrink-0 ml-2">
                              {group.type === 'collab' ? 'Collaborator' : 'Private'}
                            </span>
                          </div>

                          {/* Route Details */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/80">
                              <div className="text-[10px] text-zinc-500 font-bold uppercase">Client / Collaborator</div>
                              <div className="text-xs font-bold text-white truncate mt-0.5">{group.clientName}</div>
                            </div>
                            <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/80">
                              <div className="text-[10px] text-zinc-500 font-bold uppercase">Total Trips Count</div>
                              <div className="text-xs font-extrabold text-amber-400 mt-0.5">
                                {group.tripsCount} Trip(s) <span className="text-[10px] font-normal text-zinc-500">({group.recordsCount} entry)</span>
                              </div>
                            </div>
                          </div>

                          {/* Editable Rate Per Trip Field */}
                          <div className="space-y-1">
                            <label className="block text-[11px] font-bold text-zinc-300">
                              Rate Per Trip ({sym})
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-2.5 text-zinc-400 font-bold text-xs">{sym}</span>
                              <input
                                type="number"
                                min="0"
                                placeholder="Enter rate per trip (e.g. 600)"
                                value={rateVal}
                                onChange={(e) =>
                                  setPendingRateInputs((prev) => ({
                                    ...prev,
                                    [group.key]: e.target.value
                                  }))
                                }
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg py-2 pl-7 pr-3 text-xs text-amber-400 font-extrabold focus:border-amber-400 focus:outline-hidden"
                              />
                            </div>
                          </div>

                          {/* Real-time calculated total revenue preview */}
                          <div className="bg-zinc-900/80 px-3 py-2 rounded-lg border border-zinc-800 flex items-center justify-between text-xs">
                            <span className="text-zinc-400 text-[11px]">
                              Total Revenue Preview ({group.tripsCount} × {sym}{numRate}):
                            </span>
                            <span className="font-extrabold text-emerald-400 text-sm">
                              {formatCurrency(calculatedTotal, sym)}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Sticky Save & Update Rates Button */}
                    <div className="pt-2 sticky bottom-0 bg-zinc-900 pb-1 border-t border-zinc-800">
                      <button
                        type="button"
                        onClick={handleSavePendingRates}
                        className="w-full bg-amber-400 hover:bg-amber-300 text-black font-extrabold py-3.5 rounded-xl text-xs transition shadow-lg shadow-amber-500/20 flex items-center justify-center space-x-2 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                        <span>Save & Update Rates ({pendingRouteGroups.length} Route(s))</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {settingsTab === 'admin' && (
              /* ADMIN SECTION: EDIT MY TRIPS */
              <div className="space-y-3 font-mono">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 flex items-start space-x-2.5">
                  <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-amber-400 font-bold">ADMIN TRIP MANAGEMENT PANEL</strong>
                    <span className="text-[11px] text-zinc-400">
                      Centralized admin controls to edit or remove any recorded trips, expenses, or payouts safely.
                    </span>
                  </div>
                </div>

                {/* Admin Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={adminSearchQuery}
                    onChange={(e) => setAdminSearchQuery(e.target.value)}
                    placeholder="Search trip by collaborator, customer, route, or date..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                  />
                  {adminSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setAdminSearchQuery('')}
                      className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Category filter tabs */}
                <div className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-[11px] overflow-x-auto">
                  {[
                    { id: 'all', label: 'All Entries' },
                    { id: 'collab', label: 'Collab Trips 🚚' },
                    { id: 'private', label: 'Private Trips 💼' },
                    { id: 'expense', label: 'Expenses ⛽' },
                    { id: 'payment', label: 'Payouts 💵' }
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setAdminCategoryFilter(f.id as any)}
                      className={`px-2.5 py-1 rounded-lg font-medium transition whitespace-nowrap ${
                        adminCategoryFilter === f.id
                          ? 'bg-amber-400 text-black font-bold'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* List of trips with explicit Edit Trip button */}
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {combinedActivityStream
                    .filter((item) => {
                      if (adminCategoryFilter !== 'all' && item.type !== adminCategoryFilter) return false;
                      if (adminSearchQuery.trim()) {
                        const q = adminSearchQuery.toLowerCase();
                        return (
                          item.title.toLowerCase().includes(q) ||
                          item.subtitle.toLowerCase().includes(q) ||
                          item.date.includes(q) ||
                          (item.collaboratorName && item.collaboratorName.toLowerCase().includes(q))
                        );
                      }
                      return true;
                    })
                    .map((item) => (
                      <div
                        key={item.id}
                        className="bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                item.type === 'collab'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : item.type === 'private'
                                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                  : item.type === 'expense'
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              }`}
                            >
                              {item.type}
                            </span>
                            <span className="text-xs font-bold text-white">{item.title}</span>
                            <span className="text-[10px] text-zinc-500">({formatDateReadable(item.date)})</span>
                          </div>
                          <p className="text-[11px] text-zinc-400 line-clamp-1">{item.subtitle}</p>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end space-x-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800/60">
                          <span
                            className={`text-xs font-bold font-mono ${
                              item.isIncome ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {item.isIncome ? '+' : '-'}{formatCurrency(item.amount, sym)}
                          </span>

                          <div className="flex items-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                handleEditItem(item);
                              }}
                              className="px-2.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-black font-bold text-[11px] rounded-lg transition flex items-center space-x-1 shadow-xs"
                              title="Edit this trip in Admin Mode"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Edit Trip</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                requestDelete(item.id, item.type, item.title);
                              }}
                              className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                              title="Delete entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                  {combinedActivityStream.filter((item) => {
                    if (adminCategoryFilter !== 'all' && item.type !== adminCategoryFilter) return false;
                    if (adminSearchQuery.trim()) {
                      const q = adminSearchQuery.toLowerCase();
                      return (
                        item.title.toLowerCase().includes(q) ||
                        item.subtitle.toLowerCase().includes(q) ||
                        item.date.includes(q)
                      );
                    }
                    return true;
                  }).length === 0 && (
                    <div className="p-6 text-center text-xs text-zinc-500 bg-zinc-950/40 rounded-xl border border-zinc-800/50">
                      No matching trip entries found for editing.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 6: QUICK ADD COLLABORATOR            */}
      {/* ========================================== */}
      {showAddCollabModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-amber-500/50 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2 text-amber-400 font-mono font-bold text-base">
                <Users className="w-5 h-5" />
                <span>{editingCollabId ? 'EDIT COLLABORATOR' : 'ADD NEW COLLABORATOR'}</span>
              </div>
              <button
                onClick={() => {
                  setShowAddCollabModal(false);
                  setEditingCollabId(null);
                }}
                className="text-zinc-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCollaborator} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-zinc-400 mb-1">Company / Collaborator Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Delta Mining Infra Ltd"
                  value={newCollabForm.name}
                  onChange={(e) => setNewCollabForm({ ...newCollabForm, name: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white font-bold focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Contact Phone</label>
                <input
                  type="text"
                  placeholder="+91 98765 43210"
                  value={newCollabForm.phone}
                  onChange={(e) => setNewCollabForm({ ...newCollabForm, phone: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Default Agreed Rate per Trip ({sym})</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={newCollabForm.defaultRate}
                  onChange={(e) =>
                    setNewCollabForm({
                      ...newCollabForm,
                      defaultRate: e.target.value === '' ? '' : Number(e.target.value)
                    })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Contract / Route Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Earthwork site contract"
                  value={newCollabForm.notes}
                  onChange={(e) => setNewCollabForm({ ...newCollabForm, notes: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white focus:border-amber-400"
                ></textarea>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCollabModal(false);
                    setEditingCollabId(null);
                  }}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold py-2.5 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-bold py-2.5 rounded-xl transition shadow-lg shadow-amber-500/20"
                >
                  {editingCollabId ? 'Update Collaborator' : 'Create Collaborator'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 7: SUPABASE BACKEND MANAGER          */}
      {/* ========================================== */}
      {showSupabaseModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-emerald-500/50 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2 text-emerald-400 font-mono font-bold text-base">
                <Database className="w-5 h-5 text-emerald-400" />
                <span>SUPABASE BACKEND</span>
              </div>
              <button
                onClick={() => setShowSupabaseModal(false)}
                className="text-zinc-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
                  <span className="text-emerald-300 font-bold">
                    {supabaseConnected ? 'Supabase Connected' : 'Connecting to Supabase...'}
                  </span>
                </div>
                {isSyncing ? (
                  <span className="text-amber-400 font-bold animate-pulse">Syncing...</span>
                ) : (
                  <span className="text-emerald-400 text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                    Live Active
                  </span>
                )}
              </div>

              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold">Project ID</span>
                  <span className="text-white font-bold select-all">{SUPABASE_PROJECT_ID}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold">Project URL</span>
                  <span className="text-emerald-400 font-semibold truncate block select-all">{SUPABASE_PROJECT_URL}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold">Publishable API Key</span>
                  <span className="text-zinc-400 font-mono truncate block text-[10px] select-all">
                    sb_publishable_PV_8wTRzvNUiweWjuJPE2g_B8sZxbau
                  </span>
                </div>
              </div>

              <div className="pt-2 flex space-x-2">
                <button
                  type="button"
                  onClick={async () => {
                    setIsSyncing(true);
                    const res = await checkSupabaseConnection();
                    setSupabaseConnected(res.connected);
                    setSupabaseMessage(res.message);
                    await saveStateToSupabase(data);
                    setIsSyncing(false);
                    alert(res.message + ' Data synced to Supabase.');
                  }}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-2.5 rounded-xl transition flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20"
                >
                  <Database className="w-4 h-4" />
                  <span>Sync Now</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(SUPABASE_SQL_SCRIPT);
                    setCopySuccess(true);
                    setTimeout(() => setCopySuccess(false), 2500);
                  }}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-bold py-2.5 rounded-xl transition flex items-center justify-center space-x-2"
                >
                  {copySuccess ? <Check className="w-4 h-4 text-emerald-400" /> : <FileText className="w-4 h-4" />}
                  <span>{copySuccess ? 'SQL Copied!' : 'Copy SQL Script'}</span>
                </button>
              </div>

              <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 text-[10px] text-zinc-400 space-y-1">
                <p className="font-bold text-emerald-400">⚡ Multi-Device Cloud Sync Enabled:</p>
                <p className="leading-relaxed">
                  Your project is linked to Supabase project <code className="text-white font-bold">etpiikmfszmggjdppiua</code>. All trip logs, expenses, collaborators, and payouts are automatically synced.
                </p>
                <p className="text-zinc-500 pt-1">
                  To enable custom table persistence in Supabase, click "Copy SQL Script" and paste it in your Supabase SQL Editor.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 8: ACCOUNTING LEDGER & PDF EXPORT    */}
      {/* ========================================== */}
      {showPdfReportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-zinc-900 border border-amber-500/50 rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2 text-amber-400 font-mono font-bold text-base">
                <Printer className="w-5 h-5 text-amber-400" />
                <span>ACCOUNTING PDF REPORT</span>
              </div>
              <button
                onClick={() => setShowPdfReportModal(false)}
                className="text-zinc-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Document Summary Card Preview */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3 font-mono">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                  <div>
                    <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">Document Header</span>
                    <h3 className="text-sm font-extrabold text-white">TIPPERLOG STATEMENT</h3>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-zinc-500 block">Vehicle Reg</span>
                    <span className="text-xs font-bold text-emerald-400">{data.settings.vehicleRegNo}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Owner:</span>
                    <span className="text-zinc-200 font-bold">{data.settings.ownerName || 'Vehicle Owner'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Time Period:</span>
                    <span className="text-amber-400 font-bold capitalize">{selectedDateFilter.replace('_', ' ')}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Gross Revenue:</span>
                    <span className="text-emerald-400 font-bold">{formatCurrency(filteredSummary.grossRevenue, sym)}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Total Expenses:</span>
                    <span className="text-rose-400 font-bold">{formatCurrency(filteredSummary.totalExpenses, sym)}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Net Operating Profit:</span>
                    <span className="text-white font-black">{formatCurrency(filteredSummary.netProfit, sym)}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Total Trips Recorded:</span>
                    <span className="text-amber-400 font-bold">{filteredSummary.totalTrips} Trips</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const label = selectedDateFilter === 'today' ? 'Today' : selectedDateFilter === 'this_week' ? 'This Week' : selectedDateFilter === 'this_month' ? 'This Month' : 'All Time';
                    generateAccountingPDF({ data, dateFilterLabel: label });
                  }}
                  className="flex-1 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-extrabold py-3 rounded-xl transition flex items-center justify-center space-x-2 shadow-lg shadow-amber-400/20 text-xs font-mono"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>Download PDF Statement</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    window.print();
                  }}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-bold px-4 py-3 rounded-xl transition flex items-center justify-center space-x-2 text-xs font-mono"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print</span>
                </button>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-[11px] text-amber-300/90 leading-relaxed font-mono">
                ℹ️ The generated PDF contains an official accounting breakdown including vehicle registration details, executive financial summary, collaborator balances, and itemized transaction log entries for tax & bookkeeping purposes.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: TRANSACTION CONFIRMATION DIALOG     */}
      {/* ========================================== */}
      {transactionSuccessModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
          <div className="bg-zinc-900 border border-emerald-500/40 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl relative">
            {/* Header / Success Indicator */}
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-emerald-500/10 border-2 border-emerald-500/40 text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
              </div>
              <h3 className="text-lg font-mono font-bold text-white tracking-wide">
                {transactionSuccessModal.title}
              </h3>
              <p className="text-xs font-mono text-zinc-400">
                Transaction has been successfully saved to your records.
              </p>
            </div>

            {/* Transaction Details Card */}
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2 font-mono">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Entry Type</span>
                <span className="font-bold text-white capitalize">{transactionSuccessModal.type} Log</span>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Details</span>
                <span className="font-bold text-zinc-200 text-right max-w-[200px] truncate">
                  {transactionSuccessModal.subtitle}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Date Recorded</span>
                <span className="font-bold text-zinc-300">
                  {formatDateReadable(transactionSuccessModal.date)}
                </span>
              </div>
              <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-300">Total Value</span>
                <span className="text-base font-extrabold text-emerald-400">
                  {formatCurrency(transactionSuccessModal.amount, sym)}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-1 font-mono text-xs">
              {/* Primary Action: + Save & Log Another */}
              <button
                type="button"
                onClick={() => {
                  const targetType = transactionSuccessModal.type;
                  setTransactionSuccessModal(null);
                  if (targetType === 'collab') {
                    setActiveModal('collab');
                  } else if (targetType === 'private') {
                    setActiveModal('private');
                  } else if (targetType === 'expense') {
                    setActiveModal('expense');
                  } else if (targetType === 'payment') {
                    setActiveModal('payment');
                  }
                }}
                className="w-full bg-amber-400 hover:bg-amber-300 text-black font-extrabold py-3 rounded-xl text-xs transition shadow-lg shadow-amber-500/20 flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>+ Save & Log Another</span>
              </button>

              {/* Optional Fuel Expense Helper for Private/Collab Trips */}
              {(transactionSuccessModal.type === 'private' || transactionSuccessModal.type === 'collab') && (
                <button
                  type="button"
                  onClick={() => {
                    const savedDate = transactionSuccessModal.date;
                    const savedCustomer = transactionSuccessModal.subtitle;
                    setTransactionSuccessModal(null);
                    setExpenseForm({
                      date: savedDate,
                      category: 'Fuel',
                      amount: transactionSuccessModal.savedFuel || 0,
                      notes: `Fuel expense for ${savedCustomer}`
                    });
                    setActiveModal('expense');
                  }}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-rose-400 border border-rose-500/30 font-bold py-2.5 rounded-xl transition flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <Fuel className="w-3.5 h-3.5 text-rose-400" />
                  <span>+ Add Fuel Expense for this Trip</span>
                </button>
              )}

              {/* Exit Button */}
              <button
                type="button"
                onClick={() => {
                  setTransactionSuccessModal(null);
                  setActiveModal(null);
                }}
                className="w-full bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 font-bold py-2.5 rounded-xl transition flex items-center justify-center space-x-2 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Exit</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* TRANSACTION DETAIL & TOTAL INFO POPUP      */}
      {/* ========================================== */}
      {selectedTransactionDetail && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-amber-500/40 rounded-2xl sm:rounded-3xl w-full max-w-lg p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl font-mono text-xs">
            
            {/* Header */}
            <div className="flex items-start justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-3">
                <div
                  className={`p-2.5 rounded-xl ${
                    selectedTransactionDetail.type === 'collab'
                      ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                      : selectedTransactionDetail.type === 'private'
                      ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                      : selectedTransactionDetail.type === 'expense'
                      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {selectedTransactionDetail.type === 'collab' && <Truck className="w-5 h-5" />}
                  {selectedTransactionDetail.type === 'private' && <Briefcase className="w-5 h-5" />}
                  {selectedTransactionDetail.type === 'expense' && <Fuel className="w-5 h-5" />}
                  {selectedTransactionDetail.type === 'payment' && <DollarSign className="w-5 h-5" />}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">
                      {selectedTransactionDetail.type === 'collab'
                        ? 'Collab Trip Log'
                        : selectedTransactionDetail.type === 'private'
                        ? 'Private Trip Log'
                        : selectedTransactionDetail.type === 'expense'
                        ? 'Operational Expense'
                        : 'Collaborator Payout'}
                    </span>
                    {selectedTransactionDetail.type === 'collab' && (
                      <button
                        onClick={() => {
                          handleToggleCollabSettled(selectedTransactionDetail.id);
                          setSelectedTransactionDetail((prev) =>
                            prev ? { ...prev, settled: !prev.settled } : null
                          );
                        }}
                        className={`text-[9px] px-2 py-0.5 rounded-md font-bold transition cursor-pointer ${
                          selectedTransactionDetail.settled
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-zinc-800 text-zinc-400 hover:text-amber-400 border border-zinc-700'
                        }`}
                      >
                        {selectedTransactionDetail.settled ? '✓ SETTLED' : '+ Mark Settled'}
                      </button>
                    )}
                  </div>
                  <h3 className="text-base font-extrabold text-white mt-0.5">
                    {selectedTransactionDetail.title}
                  </h3>
                </div>
              </div>

              <button
                onClick={() => setSelectedTransactionDetail(null)}
                className="text-zinc-400 hover:text-white p-1.5 rounded-xl hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Main Total Amount Banner */}
            <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider block">
                  {selectedTransactionDetail.isIncome ? 'TOTAL REVENUE' : 'TOTAL OUTFLOW'}
                </span>
                <div
                  className={`text-2xl font-black ${
                    selectedTransactionDetail.isIncome ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {selectedTransactionDetail.isIncome ? '+' : '-'}{formatCurrency(selectedTransactionDetail.amount, sym)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider block">DATE</span>
                <div className="text-xs font-bold text-zinc-200">
                  {formatDateReadable(selectedTransactionDetail.date)}
                </div>
              </div>
            </div>

            {/* Detail Breakdown Cards */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider px-1">
                Total Information Breakdown
              </h4>

              {/* COLLAB TRIP DETAILS */}
              {selectedTransactionDetail.type === 'collab' && (
                <div className="bg-zinc-950 rounded-2xl p-3.5 border border-zinc-800/80 space-y-2.5">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-zinc-500 text-[10px] block">Trips Completed</span>
                      <span className="font-bold text-white text-sm">
                        {selectedTransactionDetail.rawObject.tripsCount || 1} Trips
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] block">Rate Per Trip</span>
                      <span className="font-bold text-amber-400 text-sm">
                        {sym}{selectedTransactionDetail.rawObject.ratePerTrip || 0} / trip
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] block">Shift Type</span>
                      <span className="font-bold text-zinc-200">
                        {selectedTransactionDetail.rawObject.shift || 'Day'} Shift
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] block">Collaborator</span>
                      <span className="font-bold text-amber-300">
                        {selectedTransactionDetail.collaboratorName || selectedTransactionDetail.title}
                      </span>
                    </div>
                  </div>

                  {/* Route */}
                  {(selectedTransactionDetail.rawObject.loadingPoint || selectedTransactionDetail.rawObject.unloadingPoint) && (
                    <div className="pt-2 border-t border-zinc-800/80 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-zinc-500 text-[10px] block">Loading Point</span>
                        <span className="font-bold text-zinc-300">
                          {selectedTransactionDetail.rawObject.loadingPoint || 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-[10px] block">Unloading Point</span>
                        <span className="font-bold text-zinc-300">
                          {selectedTransactionDetail.rawObject.unloadingPoint || 'N/A'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Financial Breakdown (Fuel, Driver Pay, Net Margin) */}
                  <div className="pt-2 border-t border-zinc-800/80 grid grid-cols-3 gap-2 bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800">
                    <div>
                      <span className="text-[9px] text-zinc-400 uppercase block">Fuel Cost</span>
                      <span className="font-bold text-rose-400">
                        {formatCurrency(selectedTransactionDetail.rawObject.fuelExpense || 0, sym)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-zinc-400 uppercase block">Driver Pay</span>
                      <span className="font-bold text-amber-400">
                        {formatCurrency(selectedTransactionDetail.rawObject.driverPay || 0, sym)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-zinc-400 uppercase block">Net Margin</span>
                      <span className="font-bold text-emerald-400">
                        {formatCurrency(
                          selectedTransactionDetail.amount -
                            (selectedTransactionDetail.rawObject.fuelExpense || 0) -
                            (selectedTransactionDetail.rawObject.driverPay || 0),
                          sym
                        )}
                      </span>
                    </div>
                  </div>

                  {selectedTransactionDetail.rawObject.notes && (
                    <div className="pt-2 border-t border-zinc-800/80">
                      <span className="text-zinc-500 text-[10px] block">Notes / Remarks</span>
                      <p className="text-zinc-300 text-xs italic">
                        "{selectedTransactionDetail.rawObject.notes}"
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* PRIVATE TRIP DETAILS */}
              {selectedTransactionDetail.type === 'private' && (
                <div className="bg-zinc-950 rounded-2xl p-3.5 border border-zinc-800/80 space-y-2.5">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-zinc-500 text-[10px] block">Customer / Site</span>
                      <span className="font-bold text-white text-sm">
                        {selectedTransactionDetail.rawObject.customerName}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] block">Payment Status</span>
                      <span className="font-bold text-cyan-400">
                        {selectedTransactionDetail.rawObject.paymentStatus}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] block">Trips Completed</span>
                      <span className="font-bold text-zinc-200">
                        {selectedTransactionDetail.rawObject.tripsCount} Trips
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] block">Rate Per Trip</span>
                      <span className="font-bold text-cyan-300">
                        {sym}{selectedTransactionDetail.rawObject.ratePerTrip} / trip
                      </span>
                    </div>
                  </div>

                  {selectedTransactionDetail.rawObject.extraFuelCost > 0 && (
                    <div className="pt-2 border-t border-zinc-800/80">
                      <span className="text-zinc-500 text-[10px] block">Extra Fuel Expense</span>
                      <span className="font-bold text-rose-400">
                        {formatCurrency(selectedTransactionDetail.rawObject.extraFuelCost, sym)}
                      </span>
                    </div>
                  )}

                  {selectedTransactionDetail.rawObject.notes && (
                    <div className="pt-2 border-t border-zinc-800/80">
                      <span className="text-zinc-500 text-[10px] block">Notes / Remarks</span>
                      <p className="text-zinc-300 text-xs italic">
                        "{selectedTransactionDetail.rawObject.notes}"
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* EXPENSE DETAILS */}
              {selectedTransactionDetail.type === 'expense' && (
                <div className="bg-zinc-950 rounded-2xl p-3.5 border border-zinc-800/80 space-y-2.5">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-zinc-500 text-[10px] block">Expense Category</span>
                      <span className="font-bold text-rose-400 text-sm">
                        {selectedTransactionDetail.rawObject.category}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] block">Total Amount Paid</span>
                      <span className="font-bold text-rose-400 text-sm">
                        {formatCurrency(selectedTransactionDetail.amount, sym)}
                      </span>
                    </div>
                  </div>

                  {selectedTransactionDetail.rawObject.notes && (
                    <div className="pt-2 border-t border-zinc-800/80">
                      <span className="text-zinc-500 text-[10px] block">Notes / Receipt Reference</span>
                      <p className="text-zinc-300 text-xs italic">
                        "{selectedTransactionDetail.rawObject.notes}"
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* PAYMENT RECEIVED DETAILS */}
              {selectedTransactionDetail.type === 'payment' && (
                <div className="bg-zinc-950 rounded-2xl p-3.5 border border-zinc-800/80 space-y-2.5">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-zinc-500 text-[10px] block">Collaborator</span>
                      <span className="font-bold text-emerald-400 text-sm">
                        {selectedTransactionDetail.collaboratorName || selectedTransactionDetail.title}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-[10px] block">Payment Received</span>
                      <span className="font-bold text-emerald-400 text-sm">
                        {formatCurrency(selectedTransactionDetail.amount, sym)}
                      </span>
                    </div>
                  </div>

                  {selectedTransactionDetail.rawObject.referenceNote && (
                    <div className="pt-2 border-t border-zinc-800/80">
                      <span className="text-zinc-500 text-[10px] block">Reference Note</span>
                      <p className="text-zinc-300 text-xs italic">
                        "{selectedTransactionDetail.rawObject.referenceNote}"
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Action Buttons */}
            <div className="pt-2 flex items-center justify-between gap-2 border-t border-zinc-800">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const item = selectedTransactionDetail;
                    setSelectedTransactionDetail(null);
                    handleEditItem(item);
                  }}
                  className="bg-zinc-800 hover:bg-zinc-700 text-amber-400 font-bold px-3 py-2 rounded-xl transition flex items-center space-x-1.5 cursor-pointer border border-zinc-700"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Entry</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const item = selectedTransactionDetail;
                    setSelectedTransactionDetail(null);
                    requestDelete(item.id, item.type, item.title);
                  }}
                  className="bg-zinc-800 hover:bg-rose-950 hover:text-rose-400 text-zinc-400 font-bold px-3 py-2 rounded-xl transition flex items-center space-x-1.5 cursor-pointer border border-zinc-700"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTransactionDetail(null)}
                className="bg-amber-400 hover:bg-amber-300 text-black font-extrabold px-4 py-2 rounded-xl transition cursor-pointer shadow-md"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 9: DELETE CONFIRMATION DIALOG        */}
      {/* ========================================== */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-zinc-900 border border-rose-500/50 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-400 font-mono font-bold text-base border-b border-zinc-800 pb-3">
              <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <span>{deleteConfirmTarget.title}</span>
            </div>

            <p className="text-xs text-zinc-300 font-mono leading-relaxed">
              {deleteConfirmTarget.description || 'Are you sure you want to delete this record? This action cannot be undone.'}
            </p>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold py-2.5 rounded-xl text-xs font-mono transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDelete}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-xl text-xs font-mono transition shadow-lg shadow-rose-600/30 flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


