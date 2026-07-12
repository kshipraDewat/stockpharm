import React, { useState, useEffect } from 'react';
import { Building2, Store, UploadCloud, Package, Users, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '../../common/Button';
import Input from '../../common/Input';
import SlideOver from '../../common/SlideOver';
import { useAuthStore } from '../../../stores/authStore';
import { useUpdateTenant, useUpdateOnboarding } from '../../../hooks/useSettings';
import { usePharmacyConnections } from '../../../hooks/usePharmacyConnections';
import { usePublicStockists } from '../../../hooks/usePublicStockists';
import { useProducts } from '../../../hooks/useProducts';
import { validateGstin } from '../../../lib/validation';
import toast from 'react-hot-toast';

interface PharmacyOnboardingFlowProps {
  isOpen: boolean;
  onClose: () => void;
}

const steps = [
  { id: 'business', label: 'Business Profile', icon: Building2 },
  { id: 'stockist', label: 'Connect Stockist', icon: Store },
  { id: 'products', label: 'Import Products', icon: UploadCloud },
  { id: 'stock', label: 'Opening Stock', icon: Package },
  { id: 'staff', label: 'Add Staff', icon: Users },
];

const PharmacyOnboardingFlow: React.FC<PharmacyOnboardingFlowProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [currentStep, setCurrentStep] = useState(user?.onboardingStep ?? 0);
  const [dlNumber, setDlNumber] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const updateTenant = useUpdateTenant();
  const updateOnboarding = useUpdateOnboarding();
  const { data: connectionsData } = usePharmacyConnections();
  const connections = connectionsData?.data ?? [];
  const { data: publicStockistsData } = usePublicStockists({ pageSize: 3 });
  const discoverStockists = publicStockistsData?.data ?? [];
  const { data: productsData } = useProducts({ pageSize: 1 });
  const hasConnection = connections.some((c: { status?: string }) => ['pending', 'active'].includes(c.status ?? ''));
  const hasProducts = (productsData?.total ?? productsData?.data?.length ?? 0) > 0;

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
      const gstErr = validateGstin(gstin, false); // GST optional; if entered must be a valid 15-char GSTIN
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
    if (currentStep === 2 && !hasProducts) {
      toast.error('Add at least one product before continuing');
      return;
    }
    if (currentStep === 1 && !hasConnection) {
      toast.error('Connect a stockist before continuing');
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

  // Dismiss = "set up later". Never trap the user (X/backdrop also call this).
  // Best-effort save valid details entered, persist progress WITHOUT completing,
  // then always close.
  const handleSkip = async () => {
    try {
      if (currentStep === 0 && dlNumber.trim() && !validateGstin(gstin, false)) {
        await updateTenant.mutateAsync({
          dlNumber: dlNumber.trim(),
          gstin: gstin.trim() ? gstin.trim().toUpperCase() : null,
          addressJson: address.trim() ? JSON.stringify({ line1: address.trim() }) : null,
        });
      }
    } catch { /* best-effort — dismissing should still succeed */ }
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
    <SlideOver isOpen={isOpen} onClose={handleSkip} title="Setup Pharmacy" width="xl">
      <div className="flex flex-col md:flex-row -mx-1 min-h-[60vh]">
        <div className="md:w-1/3 bg-teal-50 border-b md:border-b-0 md:border-r border-teal-100 p-4 md:p-6 shrink-0 rounded-lg md:rounded-none">
          <div className="flex flex-row md:flex-col space-x-4 md:space-x-0 md:space-y-6 overflow-x-auto">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  currentStep > index ? 'bg-green-100 text-green-600' :
                  currentStep === index ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-500'
                }`}>
                  {currentStep > index ? <CheckCircle2 size={16} /> : <step.icon size={16} />}
                </div>
                <p className={`ml-2 text-sm font-semibold whitespace-nowrap ${currentStep >= index ? 'text-slate-900' : 'text-slate-500'}`}>{step.label}</p>
              </div>
            ))}
          </div>
          <div className="text-xs text-slate-400 hidden md:block mt-6">Step {currentStep + 1} of {steps.length}</div>
        </div>

        <div className="md:w-2/3 p-2 md:p-4 flex flex-col flex-1">
          <div className="flex-1 overflow-y-auto">
              {currentStep === 0 && (
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-gray-900">Your Pharmacy Details</h3>
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
                  <h3 className="text-xl font-bold text-gray-900">Connect a Stockist</h3>
                  <p className="text-sm text-gray-500">Browse verified distributors and request a connection to start placing purchase orders.</p>
                  {hasConnection ? (
                    <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">Connection request sent or active — you&apos;re set!</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {discoverStockists.filter((s: any) => s?.slug).map((stockist: any) => (
                          <button
                            key={stockist.id ?? stockist.slug}
                            type="button"
                            onClick={() => navigate(`/pharmacy/discover/${stockist.slug}`)}
                            className="text-left border border-slate-200 rounded-lg p-3 hover:border-teal-300 hover:bg-teal-50/40 transition-colors"
                          >
                            <p className="text-sm font-semibold text-slate-800 line-clamp-1">{stockist.businessName ?? stockist.name}</p>
                            <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{stockist.gstin ?? 'GSTIN hidden'}</p>
                            <p className="text-[11px] text-slate-400 mt-1">View catalog</p>
                          </button>
                        ))}
                      </div>
                      <Button variant="primary" className="!bg-teal-600 hover:!bg-teal-700" onClick={() => navigate('/pharmacy/discover')}>
                        Browse Stockists
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-gray-900">Import Products</h3>
                  <p className="text-sm text-gray-500">Add products manually or import from your stockist catalog after connecting.</p>
                  {hasProducts ? (
                    <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">Products found in your catalog.</p>
                  ) : (
                    <Button variant="primary" className="!bg-teal-600 hover:!bg-teal-700" onClick={() => navigate('/pharmacy/products')}>
                      Add Products
                    </Button>
                  )}
                </div>
              )}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-gray-900">Opening Stock</h3>
                  <p className="text-sm text-gray-500">Receive GRN from stockist orders or add opening stock on product detail pages. You can skip this step.</p>
                </div>
              )}
              {currentStep === 4 && (
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-gray-900">Add Staff</h3>
                  <p className="text-sm text-gray-500">Invite pharmacist and cashier users from Settings → Staff.</p>
                  <Button variant="secondary" onClick={() => navigate('/pharmacy/settings')}>Go to Settings</Button>
                </div>
              )}
            </div>

            <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
              {currentStep > 0 ? (
                <Button variant="secondary" onClick={handleBack}>Back</Button>
              ) : (
                <Button variant="secondary" onClick={handleSkip}>Dismiss</Button>
              )}
              {currentStep < steps.length - 1 ? (
                <Button variant="primary" className="!bg-teal-600 hover:!bg-teal-700" onClick={handleNext} isLoading={updateTenant.isPending || updateOnboarding.isPending}>Next Step</Button>
              ) : (
                <Button variant="primary" className="!bg-teal-600 hover:!bg-teal-700" onClick={handleComplete} isLoading={updateOnboarding.isPending} leftIcon={<CheckCircle2 size={16} />}>Complete Setup</Button>
              )}
            </div>
          </div>
        </div>
    </SlideOver>
  );
};

export default PharmacyOnboardingFlow;
