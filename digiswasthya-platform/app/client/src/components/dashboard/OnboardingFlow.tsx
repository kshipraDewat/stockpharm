import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Store, UploadCloud, Users, CheckCircle2 } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';
import SlideOver from '../common/SlideOver';
import { useAuthStore } from '../../stores/authStore';
import { useUpdateTenant, useUpdateOnboarding } from '../../hooks/useSettings';
import { usePharmacies } from '../../hooks/usePharmacies';
import { useProducts } from '../../hooks/useProducts';
import { useUsers } from '../../hooks/useUsers';
import { validateGstin } from '../../lib/validation';
import toast from 'react-hot-toast';

interface OnboardingFlowProps {
  isOpen: boolean;
  onClose: () => void;
}

const steps = [
  { id: 'business', label: 'Business Profile', icon: Building2 },
  { id: 'pharmacy', label: 'First Pharmacy', icon: Store },
  { id: 'products', label: 'Import Products', icon: UploadCloud },
  { id: 'staff', label: 'Add Staff', icon: Users },
];

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [currentStep, setCurrentStep] = useState(user?.onboardingStep ?? 0);
  const [dlNumber, setDlNumber] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const updateTenant = useUpdateTenant();
  const updateOnboarding = useUpdateOnboarding();
  const { data: pharmaciesData } = usePharmacies({ pageSize: 1 });
  const { data: productsData } = useProducts({ pageSize: 1 });
  const { data: usersData } = useUsers();
  const hasPharmacy = (pharmaciesData?.total ?? pharmaciesData?.data?.length ?? 0) > 0;
  const hasProducts = (productsData?.total ?? productsData?.data?.length ?? 0) > 0;
  const hasStaff = (usersData?.length ?? usersData?.data?.length ?? 0) > 1;

  useEffect(() => {
    if (user?.onboardingStep != null) setCurrentStep(user.onboardingStep);
  }, [user?.onboardingStep]);

  const persistStep = async (step: number, completed = false) => {
    await updateOnboarding.mutateAsync({
      onboardingStep: step,
      ...(completed ? { onboardingCompleted: true } : {}),
    });
  };

  const handleNext = async () => {
    if (currentStep === 0) {
      if (!dlNumber.trim()) { toast.error('Drug License is required'); return; }
      const gstErr = validateGstin(gstin, false); // GST is optional, but if entered it must be a valid 15-char GSTIN
      if (gstErr) { toast.error(gstErr); return; }
      try {
        await updateTenant.mutateAsync({
          dlNumber: dlNumber.trim(),
          gstin: gstin.trim() ? gstin.trim().toUpperCase() : null,
          addressJson: address.trim() ? JSON.stringify({ line1: address.trim() }) : null,
        });
        const next = currentStep + 1;
        await persistStep(next);
        setCurrentStep(next);
      } catch {
        toast.error('Failed to save business profile');
      }
      return;
    }
    if (currentStep === 1 && !hasPharmacy) {
      toast.error('Add at least one pharmacy before continuing');
      return;
    }
    if (currentStep === 2 && !hasProducts) {
      toast.error('Add at least one product before continuing');
      return;
    }
    if (currentStep < steps.length - 1) {
      const next = currentStep + 1;
      await persistStep(next);
      setCurrentStep(next);
    } else {
      await persistStep(currentStep, true);
      onClose();
    }
  };

  // Dismiss = "set up later". It must never trap the user (the X and backdrop
  // also call this). Best-effort persist any valid details entered so far and
  // save progress WITHOUT marking onboarding complete, then always close.
  const handleSkip = async () => {
    try {
      if (currentStep === 0 && dlNumber.trim() && !validateGstin(gstin, false)) {
        await updateTenant.mutateAsync({
          dlNumber: dlNumber.trim(),
          gstin: gstin.trim() ? gstin.trim().toUpperCase() : null,
          addressJson: address.trim() ? JSON.stringify({ line1: address.trim() }) : null,
        });
      }
    } catch { /* saving is best-effort — dismissing should still succeed */ }
    try { await persistStep(currentStep); } catch { /* ignore — never block dismiss */ }
    onClose();
  };

  const handleBack = async () => {
    const prev = currentStep - 1;
    await persistStep(prev);
    setCurrentStep(prev);
  };

  const handleComplete = async () => {
    await persistStep(steps.length, true);
    onClose();
  };

  return (
    <SlideOver isOpen={isOpen} onClose={handleSkip} title="Setup StockistPanel" width="xl">
      <div className="flex flex-col md:flex-row -mx-1 min-h-[60vh]">
        <div className="md:w-1/3 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-100 p-4 md:p-6 shrink-0 rounded-lg md:rounded-none">
          <div className="flex flex-row md:flex-col space-x-4 md:space-x-0 md:space-y-6 overflow-x-auto">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    currentStep > index ? 'bg-green-100 text-green-600' :
                    currentStep === index ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {currentStep > index ? <CheckCircle2 size={16} /> : <step.icon size={16} />}
                  </div>
                  <p className={`ml-2 text-sm font-semibold whitespace-nowrap ${currentStep >= index ? 'text-gray-900' : 'text-gray-500'}`}>{step.label}</p>
                </div>
              ))}
            </div>
            <div className="text-xs text-slate-400 hidden md:block mt-6">Step {currentStep + 1} of {steps.length}</div>
          </div>

          <div className="md:w-2/3 p-2 md:p-4 flex flex-col flex-1">
            <div className="flex-1 overflow-y-auto">
              {currentStep === 0 && (
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-gray-900">Your Business Details</h3>
                  <Input label="Drug License No. (DL)" value={dlNumber} onChange={e => setDlNumber(e.target.value)} required />
                  <Input label="GST Number" value={gstin} onChange={e => setGstin(e.target.value)} placeholder="Optional" />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Registered Address</label>
                    <textarea className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md h-24" value={address} onChange={e => setAddress(e.target.value)} />
                  </div>
                </div>
              )}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-gray-900">Add Your First Pharmacy</h3>
                  <p className="text-sm text-gray-500">Add a pharmacy customer or share your invite code from Settings → Connections for portal pharmacies.</p>
                  <Button variant="secondary" onClick={() => navigate('/pharmacies')}>Go to Pharmacies</Button>
                  {hasPharmacy && <p className="text-xs text-green-600">✓ Pharmacy added</p>}
                </div>
              )}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-gray-900">Import Products</h3>
                  <p className="text-sm text-gray-500">Upload a product CSV from Products → Bulk Import, or add products manually.</p>
                  <Button variant="secondary" onClick={() => navigate('/products')}>Go to Products</Button>
                  {hasProducts && <p className="text-xs text-green-600">✓ Products added</p>}
                </div>
              )}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-gray-900">Add Biller Staff</h3>
                  <p className="text-sm text-gray-500">Invite biller users from Settings → Staff to help with day-to-day operations.</p>
                  <Button variant="secondary" onClick={() => navigate('/settings')}>Go to Settings</Button>
                  {hasStaff && <p className="text-xs text-green-600">✓ Staff invited</p>}
                </div>
              )}
            </div>

            <div className="flex justify-between mt-8 pt-6 border-t border-slate-100">
              {currentStep > 0 ? (
                <Button variant="secondary" onClick={handleBack}>Back</Button>
              ) : (
                <Button variant="secondary" onClick={handleSkip}>Dismiss</Button>
              )}
              {currentStep < steps.length - 1 ? (
                <Button variant="primary" onClick={handleNext} isLoading={updateTenant.isPending || updateOnboarding.isPending}>Next Step</Button>
              ) : (
                <Button variant="primary" onClick={handleComplete} isLoading={updateOnboarding.isPending} leftIcon={<CheckCircle2 size={16} />}>Complete Setup</Button>
              )}
            </div>
          </div>
        </div>
    </SlideOver>
  );
};

export default OnboardingFlow;
