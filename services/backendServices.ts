
import { Donor, BloodBank, AuthenticatedUser, UserRole, BloodType } from './types';
import { MOCK_DONORS, MOCK_BANKS } from '../constants';

const DB_KEYS = {
  DONORS: 'redconnect_donor_db',
  BANKS: 'redconnect_bank_db',
  HOSPITALS: 'redconnect_hospital_db',
  OTP_STORE: 'redconnect_otp_relay'
};

const DEFAULT_INVENTORY: Record<BloodType, number> = {
  'A+': 0, 'A-': 0, 'B+': 0, 'B-': 0, 'AB+': 0, 'AB-': 0, 'O+': 0, 'O-': 0
};

interface OTPRecord {
  hash: string;
  expires: number;
  attempts: number;
  email: string;
  cooldown: number;
}

const initializeDB = () => {
  if (!localStorage.getItem(DB_KEYS.DONORS)) {
    const seededDonors = MOCK_DONORS.map(d => ({ ...d, accessKey: d.password || 'donor123' }));
    seededDonors.push({
      id: 'd-madan',
      name: 'Madan Prasath',
      age: 26,
      bloodType: 'O+',
      email: 'madanprasath2007@gmail.com',
      accessKey: 'password123',
      password: 'password123',
      phone: '+91 99999 88888',
      isAvailable: true,
      distance: 0,
      lastDonation: '2024-12-01',
      idVerified: true
    } as any);
    localStorage.setItem(DB_KEYS.DONORS, JSON.stringify(seededDonors));
  }
  
  if (!localStorage.getItem(DB_KEYS.BANKS)) {
    const seededBanks = MOCK_BANKS.map(b => ({ 
      ...b, 
      email: `${b.id}@test.com`, 
      accessKey: 'admin123',
      institutionName: b.name 
    }));
    seededBanks.push({
      id: 'b-madan',
      name: 'Madan Regional Blood Bank',
      institutionName: 'Madan Regional Blood Bank',
      email: 'madanprasath2007@gmail.com',
      accessKey: 'password123',
      inventory: { ...DEFAULT_INVENTORY, 'O+': 50, 'O-': 15 },
      plateletsCount: 100,
      location: { lat: 28.6139, lng: 77.2090, address: 'Command Node Alpha' },
      source: 'Local',
      lastSync: new Date().toISOString(),
      phone: '+91 98888 77777'
    } as any);
    localStorage.setItem(DB_KEYS.BANKS, JSON.stringify(seededBanks));
  }

  if (!localStorage.getItem(DB_KEYS.HOSPITALS)) {
    localStorage.setItem(DB_KEYS.HOSPITALS, JSON.stringify([{
      id: 'h-default',
      email: 'hospital@test.com',
      accessKey: 'admin123',
      institutionName: 'General Hospital',
      location: { lat: 28.6139, lng: 77.2090, address: 'New Delhi' }
    }]));
  }
};

initializeDB();

export const backendService = {
  async requestOtp(email: string): Promise<{ success: boolean; message: string; cooldownRemaining?: number }> {
    const otpStore: Record<string, OTPRecord> = JSON.parse(localStorage.getItem(DB_KEYS.OTP_STORE) || '{}');
    const now = Date.now();

    if (otpStore[email] && now < otpStore[email].cooldown) {
      return { 
        success: false, 
        message: 'Resend cooldown active.', 
        cooldownRemaining: Math.ceil((otpStore[email].cooldown - now) / 1000) 
      };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hash = await this._hashString(otp);

    otpStore[email] = {
      hash,
      expires: now + (5 * 60 * 1000), 
      attempts: 0,
      email,
      cooldown: now + (60 * 1000)
    };
    localStorage.setItem(DB_KEYS.OTP_STORE, JSON.stringify(otpStore));

    // Dispatch a custom event for the Virtual Mailbox simulation in UI
    window.dispatchEvent(new CustomEvent('RED_CONNECT_MAIL_INTERCEPT', {
      detail: { email, otp, timestamp: new Date().toLocaleTimeString() }
    }));

    return { success: true, message: 'Verification code sent.' };
  },

  async verifyOtp(email: string, otp: string): Promise<{ success: boolean; message: string }> {
    const otpStore: Record<string, OTPRecord> = JSON.parse(localStorage.getItem(DB_KEYS.OTP_STORE) || '{}');
    const record = otpStore[email];

    if (!record) return { success: false, message: 'Session expired. Request new code.' };
    
    if (Date.now() > record.expires) {
      delete otpStore[email];
      localStorage.setItem(DB_KEYS.OTP_STORE, JSON.stringify(otpStore));
      return { success: false, message: 'OTP has expired.' };
    }

    if (record.attempts >= 3) {
      delete otpStore[email];
      localStorage.setItem(DB_KEYS.OTP_STORE, JSON.stringify(otpStore));
      return { success: false, message: 'Too many attempts. Safety block active.' };
    }

    const inputHash = await this._hashString(otp);
    if (inputHash === record.hash) {
      delete otpStore[email];
      localStorage.setItem(DB_KEYS.OTP_STORE, JSON.stringify(otpStore));
      return { success: true, message: 'Verified.' };
    } else {
      record.attempts += 1;
      localStorage.setItem(DB_KEYS.OTP_STORE, JSON.stringify(otpStore));
      return { success: false, message: `Invalid code. ${3 - record.attempts} tries left.` };
    }
  },

  async _hashString(str: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  getDonors: (): Donor[] => JSON.parse(localStorage.getItem(DB_KEYS.DONORS) || '[]'),
  saveDonor: (donor: Donor) => {
    const donors = backendService.getDonors();
    localStorage.setItem(DB_KEYS.DONORS, JSON.stringify([donor, ...donors]));
  },
  deleteDonor: (id: string) => {
    const donors = backendService.getDonors().filter(d => d.id !== id);
    localStorage.setItem(DB_KEYS.DONORS, JSON.stringify(donors));
  },
  getInstitutions: (type: 'BloodBank' | 'Hospital'): any[] => {
    const key = type === 'BloodBank' ? DB_KEYS.BANKS : DB_KEYS.HOSPITALS;
    return JSON.parse(localStorage.getItem(key) || '[]');
  },
  saveInstitution: (data: any, type: 'BloodBank' | 'Hospital') => {
    const key = type === 'BloodBank' ? DB_KEYS.BANKS : DB_KEYS.HOSPITALS;
    const db = backendService.getInstitutions(type);
    localStorage.setItem(key, JSON.stringify([data, ...db]));
  },
  getInstitutionProfile: (id: string, type: 'BloodBank' | 'Hospital') => {
    return backendService.getInstitutions(type).find(i => i.id === id);
  },
  authenticate: async (email: string, key: string, role: UserRole): Promise<AuthenticatedUser | null> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (role === 'Donor') {
      const donors = backendService.getDonors();
      const user = donors.find(d => d.email === email && (d.password === key || (d as any).accessKey === key));
      if (user) return { id: user.id, name: user.name, email: user.email!, role: 'Donor', avatar: user.profilePicture || `https://i.pravatar.cc/150?u=${user.id}` };
    } else {
      const insts = backendService.getInstitutions(role as 'BloodBank' | 'Hospital');
      const inst = insts.find((i: any) => i.email === email && i.accessKey === key);
      if (inst) return { id: inst.id, name: inst.institutionName, email: inst.email, role: role, avatar: `https://i.pravatar.cc/150?u=${inst.id}` };
    }
    return null;
  }
};
