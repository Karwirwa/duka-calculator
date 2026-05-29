import { useState, useEffect } from 'react';
import { Store, Plus, TrendingUp, X, Share2, Crown, Calendar, Package, AlertTriangle, Home, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Product {
  id: string;
  name: string;
  sellingPrice: number;
  activeStockId: string | null;
}

interface StockCycle {
  id: string;
  productId: string;
  totalCost: number;
  totalUnits: number;
  startDate: string;
  endDate: string | null;
  status: 'active' | 'completed';
}

interface DailyRecord {
  date: string;
  productId: string;
  stockId: string;
  unitsSold: number;
  unitsUsed: number;
  unitsLost: number;
}

const PREMIUM_PROMPT_DAYS = 28; // Show premium prompt after 28 days

type ModalType = 'addProduct' | 'startStock' | 'trackUsageLoss' | 'stockComplete' | null;
type ViewType = 'daily' | 'weekly' | 'monthly' | 'reports';

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stockCycles, setStockCycles] = useState<StockCycle[]>([]);
  const [dailyRecords, setDailyRecords] = useState<DailyRecord[]>([]);
  const [todaySales, setTodaySales] = useState<Record<string, string>>({});
  const [modalType, setModalType] = useState<ModalType>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [viewType, setViewType] = useState<ViewType>('daily');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [usageCount, setUsageCount] = useState(0);

  const today = new Date().toISOString().split('T')[0];

  // Set page title and favicon
  useEffect(() => {
    document.title = 'Duka Profit Tracker';

    const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement || document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = 'image/svg+xml';
    favicon.href = '/src/favicon.svg';
    if (!document.querySelector('link[rel="icon"]')) {
      document.head.appendChild(favicon);
    }
  }, []);

  // Load data from localStorage
  useEffect(() => {
    const savedProducts = localStorage.getItem('dukaProductsV3');
    const savedStocks = localStorage.getItem('dukaStocksV3');
    const savedRecords = localStorage.getItem('dukaRecordsV3');
    const savedUsageCount = localStorage.getItem('dukaUsageCount');

    if (savedProducts) setProducts(JSON.parse(savedProducts));
    if (savedStocks) setStockCycles(JSON.parse(savedStocks));
    if (savedRecords) {
      const records = JSON.parse(savedRecords);
      setDailyRecords(records);

      // Initialize today's sales inputs
      const todayRecords = records.filter((r: DailyRecord) => r.date === today);
      const initialSales: Record<string, string> = {};
      todayRecords.forEach((record: DailyRecord) => {
        if (record.unitsSold > 0) {
          initialSales[record.productId] = record.unitsSold.toString();
        }
      });
      setTodaySales(initialSales);
    }

    if (savedUsageCount) {
      const count = parseInt(savedUsageCount);
      setUsageCount(count);
      if (count >= 3 && !localStorage.getItem('dukaSignInDismissed')) {
        setShowSignInPrompt(true);
      }
    }
  }, [today]);

  // Track usage
  useEffect(() => {
    const lastUsedDate = localStorage.getItem('dukaLastUsed');
    if (lastUsedDate !== today) {
      const newCount = usageCount + 1;
      setUsageCount(newCount);
      localStorage.setItem('dukaUsageCount', newCount.toString());
      localStorage.setItem('dukaLastUsed', today);
    }
  }, [today, usageCount]);

  // Save data
  useEffect(() => {
    localStorage.setItem('dukaProductsV3', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('dukaStocksV3', JSON.stringify(stockCycles));
  }, [stockCycles]);

  useEffect(() => {
    localStorage.setItem('dukaRecordsV3', JSON.stringify(dailyRecords));
  }, [dailyRecords]);

  const addProduct = (name: string, sellingPrice: number) => {
    const newProduct: Product = {
      id: Date.now().toString(),
      name,
      sellingPrice,
      activeStockId: null,
    };
    setProducts([...products, newProduct]);
    setModalType(null);
  };

  const startStock = (productId: string, totalCost: number, totalUnits: number) => {
    const newStock: StockCycle = {
      id: Date.now().toString(),
      productId,
      totalCost,
      totalUnits,
      startDate: today,
      endDate: null,
      status: 'active',
    };

    setStockCycles([...stockCycles, newStock]);
    setProducts(products.map(p =>
      p.id === productId ? { ...p, activeStockId: newStock.id } : p
    ));
    setModalType(null);
  };

  const updateDailySales = (productId: string, value: string) => {
    setTodaySales(prev => ({ ...prev, [productId]: value }));

    const product = products.find(p => p.id === productId);
    if (!product?.activeStockId) return;

    const unitsSold = parseInt(value) || 0;

    // Update or create daily record
    setDailyRecords(prev => {
      const existingIndex = prev.findIndex(
        r => r.date === today && r.productId === productId && r.stockId === product.activeStockId
      );

      let newRecords;
      if (existingIndex >= 0) {
        newRecords = [...prev];
        newRecords[existingIndex] = {
          ...newRecords[existingIndex],
          unitsSold,
        };
      } else if (unitsSold > 0) {
        newRecords = [...prev, {
          date: today,
          productId,
          stockId: product.activeStockId!,
          unitsSold,
          unitsUsed: 0,
          unitsLost: 0,
        }];
      } else {
        return prev;
      }

      // Check if stock should be completed
      const stock = stockCycles.find(s => s.id === product.activeStockId);
      if (stock) {
        const { totalSold, totalUsed, totalLost } = getStockTotals(stock.id, newRecords);
        const remaining = stock.totalUnits - (totalSold + totalUsed + totalLost);

        if (remaining <= 0 && stock.status === 'active') {
          setStockCycles(cycles => cycles.map(c =>
            c.id === stock.id ? { ...c, status: 'completed', endDate: today } : c
          ));
        }
      }

      return newRecords;
    });
  };

  const updateUsageLoss = (stockId: string, unitsUsed: number, unitsLost: number) => {
    const stock = stockCycles.find(s => s.id === stockId);
    if (!stock) return;

    // Update or create daily record for usage/loss
    setDailyRecords(prev => {
      const existingIndex = prev.findIndex(
        r => r.date === today && r.stockId === stockId
      );

      let newRecords;
      if (existingIndex >= 0) {
        newRecords = [...prev];
        newRecords[existingIndex] = {
          ...newRecords[existingIndex],
          unitsUsed: newRecords[existingIndex].unitsUsed + unitsUsed,
          unitsLost: newRecords[existingIndex].unitsLost + unitsLost,
        };
      } else {
        newRecords = [...prev, {
          date: today,
          productId: stock.productId,
          stockId: stockId,
          unitsSold: 0,
          unitsUsed,
          unitsLost,
        }];
      }

      // Check if stock should be completed
      const { totalSold, totalUsed, totalLost } = getStockTotals(stockId, newRecords);
      const remaining = stock.totalUnits - (totalSold + totalUsed + totalLost);

      if (remaining <= 0 && stock.status === 'active') {
        setStockCycles(cycles => cycles.map(c =>
          c.id === stockId ? { ...c, status: 'completed', endDate: today } : c
        ));
      }

      return newRecords;
    });

    setModalType(null);
  };

  const deleteProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id));
    const newTodaySales = { ...todaySales };
    delete newTodaySales[id];
    setTodaySales(newTodaySales);
  };

  const getStockTotals = (stockId: string, records: DailyRecord[] = dailyRecords) => {
    const stockRecords = records.filter(r => r.stockId === stockId);
    return {
      totalSold: stockRecords.reduce((sum, r) => sum + r.unitsSold, 0),
      totalUsed: stockRecords.reduce((sum, r) => sum + r.unitsUsed, 0),
      totalLost: stockRecords.reduce((sum, r) => sum + r.unitsLost, 0),
    };
  };

  const getActiveStock = (productId: string): StockCycle | null => {
    const product = products.find(p => p.id === productId);
    if (!product?.activeStockId) return null;
    return stockCycles.find(s => s.id === product.activeStockId) || null;
  };

  const getRemainingStock = (stockId: string): number => {
    const stock = stockCycles.find(s => s.id === stockId);
    if (!stock) return 0;

    const { totalSold, totalUsed, totalLost } = getStockTotals(stockId);
    return stock.totalUnits - (totalSold + totalUsed + totalLost);
  };

  const getDateRangeRecords = (startDate: Date, endDate: Date): DailyRecord[] => {
    return dailyRecords.filter(record => {
      const recordDate = new Date(record.date);
      return recordDate >= startDate && recordDate <= endDate;
    });
  };

  const getProfitForDateRange = (startDate: Date, endDate: Date): number => {
    const records = getDateRangeRecords(startDate, endDate);

    return records.reduce((total, record) => {
      const stock = stockCycles.find(s => s.id === record.stockId);
      const product = products.find(p => p.id === record.productId);

      if (!stock || !product) return total;

      const costPerUnit = stock.totalCost / stock.totalUnits;
      const profitPerUnit = product.sellingPrice - costPerUnit;

      return total + (record.unitsSold * profitPerUnit);
    }, 0);
  };

  const getTodayProfit = (): number => {
    const todayDate = new Date(today);
    return getProfitForDateRange(todayDate, todayDate);
  };

  const getWeekProfit = (): number => {
    const endDate = new Date(selectedDate);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 6);
    return getProfitForDateRange(startDate, endDate);
  };

  const getMonthProfit = (): number => {
    const endDate = new Date(selectedDate);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 29);
    return getProfitForDateRange(startDate, endDate);
  };

  const getDailyBreakdown = () => {
    const date = viewType === 'daily' ? selectedDate : today;
    const records = dailyRecords.filter(r => r.date === date);

    return products.map(product => {
      const record = records.find(r => r.productId === product.id);
      const stock = getActiveStock(product.id);

      let profit = 0;
      if (record && stock) {
        const costPerUnit = stock.totalCost / stock.totalUnits;
        const profitPerUnit = product.sellingPrice - costPerUnit;
        profit = record.unitsSold * profitPerUnit;
      }

      return {
        product,
        sold: record?.unitsSold || 0,
        used: record?.unitsUsed || 0,
        lost: record?.unitsLost || 0,
        profit,
      };
    });
  };

  const getWeeklyBreakdown = () => {
    const endDate = new Date(selectedDate);
    const days = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(endDate);
      date.setDate(endDate.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const dayRecords = dailyRecords.filter(r => r.date === dateStr);
      const dayProfit = dayRecords.reduce((sum, record) => {
        const stock = stockCycles.find(s => s.id === record.stockId);
        const product = products.find(p => p.id === record.productId);

        if (!stock || !product) return sum;

        const costPerUnit = stock.totalCost / stock.totalUnits;
        const profitPerUnit = product.sellingPrice - costPerUnit;

        return sum + (record.unitsSold * profitPerUnit);
      }, 0);

      days.push({
        date: dateStr,
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        profit: dayProfit,
      });
    }

    return days;
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const current = new Date(selectedDate);

    if (viewType === 'daily') {
      current.setDate(current.getDate() + (direction === 'next' ? 1 : -1));
    } else if (viewType === 'weekly') {
      current.setDate(current.getDate() + (direction === 'next' ? 7 : -7));
    } else {
      current.setDate(current.getDate() + (direction === 'next' ? 30 : -30));
    }

    setSelectedDate(current.toISOString().split('T')[0]);
  };

  const getDateRangeLabel = () => {
    const date = new Date(selectedDate);

    if (viewType === 'daily') {
      if (selectedDate === today) return 'Today';
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (selectedDate === yesterday.toISOString().split('T')[0]) return 'Yesterday';
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } else if (viewType === 'weekly') {
      const startDate = new Date(date);
      startDate.setDate(date.getDate() - 6);
      return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    } else {
      const startDate = new Date(date);
      startDate.setDate(date.getDate() - 29);
      return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
  };

  // Monthly reporting functions
  const getMonthlyRecords = () => {
    const monthlyData: Record<string, {
      records: DailyRecord[];
      products: Map<string, Product>;
      stocks: Map<string, StockCycle>;
    }> = {};

    dailyRecords.forEach(record => {
      const date = new Date(record.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          records: [],
          products: new Map(),
          stocks: new Map(),
        };
      }

      monthlyData[monthKey].records.push(record);

      const product = products.find(p => p.id === record.productId);
      if (product) {
        monthlyData[monthKey].products.set(product.id, product);
      }

      const stock = stockCycles.find(s => s.id === record.stockId);
      if (stock) {
        monthlyData[monthKey].stocks.set(stock.id, stock);
      }
    });

    return monthlyData;
  };

  const getMonthSummary = (monthKey: string, records: DailyRecord[]) => {
    let totalRevenue = 0;
    let totalProfit = 0;
    let totalLosses = 0;
    let totalUnitsSold = 0;
    const productSales: Record<string, number> = {};

    records.forEach(record => {
      const product = products.find(p => p.id === record.productId);
      const stock = stockCycles.find(s => s.id === record.stockId);

      if (product && stock) {
        const revenue = record.unitsSold * product.sellingPrice;
        const costPerUnit = stock.totalCost / stock.totalUnits;
        const profit = record.unitsSold * (product.sellingPrice - costPerUnit);
        const losses = (record.unitsUsed + record.unitsLost) * costPerUnit;

        totalRevenue += revenue;
        totalProfit += profit;
        totalLosses += losses;
        totalUnitsSold += record.unitsSold;

        productSales[product.id] = (productSales[product.id] || 0) + record.unitsSold;
      }
    });

    const bestSellingProductId = Object.entries(productSales).sort((a, b) => b[1] - a[1])[0]?.[0];
    const bestSellingProduct = products.find(p => p.id === bestSellingProductId);

    return {
      totalRevenue,
      totalProfit,
      totalLosses,
      totalUnitsSold,
      entriesCount: records.length,
      bestSellingProduct: bestSellingProduct?.name || 'N/A',
    };
  };

  const getInsight = (): string => {
    const todayProfit = getTodayProfit();

    if (products.length === 0) {
      return 'Add products to start tracking profit';
    }

    const hasActiveStock = products.some(p => p.activeStockId);
    if (!hasActiveStock) {
      return 'Start stock for your products to begin tracking';
    }

    if (todayProfit < 0) {
      return 'You are making a loss ❌';
    } else if (todayProfit > 1000) {
      return 'Good profit today 👍';
    } else if (todayProfit > 0) {
      return 'Keep going! Every sale counts';
    } else {
      return 'Log today\'s sales to see your profit';
    }
  };

  const shareProfit = () => {
    const profit = viewType === 'daily' ? getTodayProfit() :
                   viewType === 'weekly' ? getWeekProfit() :
                   getMonthProfit();
    const period = viewType === 'daily' ? 'today' :
                   viewType === 'weekly' ? 'this week' : 'this month';
    const message = `I made KSh ${profit.toLocaleString()} profit ${period} using Duka Profit Tracker`;
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const dismissSignInPrompt = () => {
    setShowSignInPrompt(false);
    localStorage.setItem('dukaSignInDismissed', 'true');
  };

  const dismissPremiumCTA = () => {
    localStorage.setItem('dukaPremiumDismissed', 'true');
  };

  const canAddProduct = true; // Free tier now has unlimited products
  const shouldShowPremiumCTA = usageCount >= PREMIUM_PROMPT_DAYS && !localStorage.getItem('dukaPremiumDismissed');
  const currentProfit = viewType === 'daily' ? getTodayProfit() :
                        viewType === 'weekly' ? getWeekProfit() :
                        getMonthProfit();

  // Helper function to render a product card
  const renderProductCard = (product: Product, showTitle: boolean = false) => {
    const activeStock = getActiveStock(product.id);
    const remaining = activeStock ? getRemainingStock(activeStock.id) : 0;

    return (
      <motion.div
        key={product.id}
        layout
        className="bg-[#F7F7F7] rounded-[20px] p-5"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-[#1F2937] mb-1">
              {product.name}
            </h3>
            <p className="text-xs text-[#6B7280]">
              Selling @ KSh {product.sellingPrice.toLocaleString()}
            </p>
          </div>
          <button
            onClick={() => deleteProduct(product.id)}
            className="text-[#DC2626] hover:bg-[#FEE2E2] p-2 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!activeStock ? (
          <button
            onClick={() => {
              setSelectedProductId(product.id);
              setModalType('startStock');
            }}
            className="w-full py-3 bg-[#16A34A] text-white font-semibold rounded-xl hover:bg-[#15803D] transition-colors"
          >
            Start Stock
          </button>
        ) : (
          <>
            <div className="bg-white rounded-xl p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#6B7280]">Remaining Stock</span>
                <span className="text-sm font-bold text-[#1F2937]">
                  {remaining} units
                </span>
              </div>
              <div className="w-full bg-[#E5E7EB] rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    remaining > 0 ? 'bg-[#16A34A]' : 'bg-[#DC2626]'
                  }`}
                  style={{
                    width: `${Math.max(0, (remaining / activeStock.totalUnits) * 100)}%`
                  }}
                />
              </div>
            </div>

            {activeStock.status === 'active' && selectedDate === today && (
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1">
                  <label className="block text-xs text-[#6B7280] mb-2">
                    Units sold today
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    value={todaySales[product.id] || ''}
                    onChange={(e) => updateDailySales(product.id, e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-[#E5E7EB] focus:border-[#16A34A] focus:outline-none text-lg"
                  />
                </div>

                <div className="text-right pt-6">
                  <p className="text-xs text-[#6B7280] mb-1">Profit</p>
                  <p className="text-lg font-bold text-[#16A34A]">
                    {((parseInt(todaySales[product.id]) || 0) *
                      (product.sellingPrice - activeStock.totalCost / activeStock.totalUnits)).toFixed(0)}
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {activeStock.status === 'active' && (
                <button
                  onClick={() => {
                    setSelectedStockId(activeStock.id);
                    setModalType('trackUsageLoss');
                  }}
                  className="flex-1 py-2 bg-white border-2 border-[#E5E7EB] text-[#6B7280] text-sm font-medium rounded-lg hover:bg-[#F9FAFB] transition-colors flex items-center justify-center gap-2"
                >
                  <Home className="w-4 h-4" />
                  Usage/Loss
                </button>
              )}

              {activeStock.status === 'completed' && (
                <button
                  onClick={() => {
                    setSelectedStockId(activeStock.id);
                    setModalType('stockComplete');
                  }}
                  className="flex-1 py-2 bg-[#16A34A] text-white text-sm font-medium rounded-lg hover:bg-[#15803D] transition-colors"
                >
                  View Results
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-white pb-6">
      <div className="max-w-md mx-auto">
        {/* 1. Header */}
        <header className="bg-[#16A34A] text-white px-4 py-6 mt-6 mb-5 mx-4 rounded-[20px] shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Store className="w-7 h-7" />
              <h1 className="text-xl font-bold">Duka Profit Tracker</h1>
            </div>
            <button
              onClick={() => canAddProduct && setModalType('addProduct')}
              className={`p-2 rounded-lg transition-colors ${
                canAddProduct ? 'hover:bg-[#15803D]' : 'opacity-50 cursor-not-allowed'
              }`}
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
          <p className="text-sm text-white/90">Your business memory system</p>
        </header>

        <div className="px-4">
          {/* 2. First Product Card (Primary Action Area) */}
          {viewType === 'daily' && selectedDate === today && products.length > 0 && (
            <div className="mb-5">
              <h2 className="text-lg font-bold text-[#1F2937] mb-3">Quick Entry</h2>
              {renderProductCard(products[0], true)}
            </div>
          )}

          {/* 3. First Sponsored Ad */}
          <div id="duka-ad-header" className="mb-5 bg-[#F7F7F7] rounded-[16px] overflow-hidden border border-[#E5E7EB]">
            <div className="px-3 py-2 border-b border-[#E5E7EB] bg-white">
              <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Sponsored</p>
            </div>
            <div className="flex items-center justify-center h-[90px]">
              <p className="text-sm text-[#9CA3AF]">Ad Space</p>
            </div>
          </div>

          {/* 4. Ecommerce CTA */}
          <div className="mb-5 bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7] rounded-[20px] p-6 border border-[#16A34A]/20 shadow-md">
            <div className="flex items-start gap-4">
              <div className="bg-[#16A34A] p-3 rounded-xl">
                <Store className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-[#1F2937] mb-2">
                  Want More Customers?
                </h3>
                <p className="text-[#4B5563] mb-4">
                  Take your business online with a ready-to-sell ecommerce website.
                </p>

                <div className="space-y-2 mb-5">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A]"></div>
                    <p className="text-sm text-[#6B7280]">Sell on WhatsApp, Facebook, and online</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A]"></div>
                    <p className="text-sm text-[#6B7280]">Mobile-friendly online stores</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A]"></div>
                    <p className="text-sm text-[#6B7280]">Fast setup for Kenyan businesses</p>
                  </div>
                </div>

                <button
                  onClick={() => window.open('https://wa.me/?text=Hi%2C%20I%27m%20interested%20in%20getting%20an%20online%20shop%20for%20my%20business', '_blank')}
                  className="w-full py-4 bg-[#16A34A] text-white font-semibold rounded-xl hover:bg-[#15803D] transition-colors shadow-md"
                >
                  Get Your Online Shop
                </button>
              </div>
            </div>
          </div>

          {/* 5. Time View Selector (Daily/Weekly/Monthly/Reports Tabs) */}
          <div className="grid grid-cols-4 gap-2 mb-5">
            <button
              onClick={() => {
                setViewType('daily');
                setSelectedDate(today);
              }}
              className={`py-3 rounded-xl font-semibold transition-colors text-sm ${
                viewType === 'daily'
                  ? 'bg-[#16A34A] text-white'
                  : 'bg-[#F7F7F7] text-[#6B7280]'
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => {
                setViewType('weekly');
                setSelectedDate(today);
              }}
              className={`py-3 rounded-xl font-semibold transition-colors text-sm ${
                viewType === 'weekly'
                  ? 'bg-[#16A34A] text-white'
                  : 'bg-[#F7F7F7] text-[#6B7280]'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => {
                setViewType('monthly');
                setSelectedDate(today);
              }}
              className={`py-3 rounded-xl font-semibold transition-colors text-sm ${
                viewType === 'monthly'
                  ? 'bg-[#16A34A] text-white'
                  : 'bg-[#F7F7F7] text-[#6B7280]'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setViewType('reports')}
              className={`py-3 rounded-xl font-semibold transition-colors text-sm ${
                viewType === 'reports'
                  ? 'bg-[#16A34A] text-white'
                  : 'bg-[#F7F7F7] text-[#6B7280]'
              }`}
            >
              Reports
            </button>
          </div>

          {/* 6. Date Navigator (hidden in reports view) */}
          {viewType !== 'reports' && (
            <div className="flex items-center justify-between mb-5 bg-[#F7F7F7] rounded-xl p-3">
            <button
              onClick={() => navigateDate('prev')}
              className="p-2 hover:bg-white rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-[#6B7280]" />
            </button>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#6B7280]" />
              <span className="text-sm font-medium text-[#1F2937]">
                {getDateRangeLabel()}
              </span>
            </div>
            <button
              onClick={() => navigateDate('next')}
              disabled={selectedDate >= today}
              className="p-2 hover:bg-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5 text-[#6B7280]" />
            </button>
          </div>
          )}

          {/* 7. Profit Summary (hidden in reports view) */}
          {viewType !== 'reports' && (
            <div className="mb-5">
            <div className="bg-gradient-to-br from-[#16A34A] to-[#15803D] rounded-[20px] p-6 text-white shadow-lg">
              <p className="text-sm opacity-90 mb-1">
                {viewType === 'daily' ? 'Profit' :
                 viewType === 'weekly' ? 'Weekly Profit' :
                 'Monthly Profit'}
              </p>
              <p className="text-4xl font-bold mb-3">
                KSh {currentProfit.toLocaleString()}
              </p>
              {viewType === 'daily' && selectedDate === today && (
                <div className="bg-white/20 rounded-xl px-3 py-2 inline-block">
                  <p className="text-sm">{getInsight()}</p>
                </div>
              )}
            </div>
          </div>
          )}

          {/* 8. Business Tip / Second Ad (hidden in reports view) */}
          {viewType !== 'reports' && (
          <div id="duka-ad-content" className="mb-5 bg-[#F7F7F7] rounded-[20px] overflow-hidden border border-[#E5E7EB]">
            <div className="px-4 py-2 border-b border-[#E5E7EB] bg-white">
              <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Business Tip / Sponsored</p>
            </div>
            <div className="flex items-center justify-center py-8 px-4">
              <p className="text-sm text-[#9CA3AF]">Google AdSense Ad</p>
            </div>
          </div>
          )}

          {/* Monthly Reports View */}
          {viewType === 'reports' ? (
            <MonthlyReportsView
              monthlyRecords={getMonthlyRecords()}
              products={products}
              stockCycles={stockCycles}
              getMonthSummary={getMonthSummary}
            />
          ) : null}

          {/* 9. Remaining Sales List & View-Specific Content */}
          {viewType === 'daily' && selectedDate === today ? (
            /* Daily Sales Tracker */
            <>
              {products.length === 0 ? (
                <div className="text-center py-12">
                  <Store className="w-16 h-16 text-[#D1D5DB] mx-auto mb-4" />
                  <h3 className="font-semibold text-[#1F2937] mb-2">Start tracking your profit</h3>
                  <p className="text-sm text-[#6B7280] mb-6 px-8">
                    Add your first product to begin tracking stock cycles and profit
                  </p>
                  <button
                    onClick={() => setModalType('addProduct')}
                    className="bg-[#16A34A] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#15803D] transition-colors"
                  >
                    Add First Product
                  </button>
                </div>
              ) : products.length > 1 ? (
                <>
                  <div className="mb-4">
                    <h2 className="text-lg font-bold text-[#1F2937] mb-1">Other Products</h2>
                    <p className="text-sm text-[#6B7280]">Track all your inventory</p>
                  </div>

                  <div className="space-y-4 mb-6">
                    {products.slice(1).map((product) => renderProductCard(product))}
                  </div>
                </>
              ) : null}
            </>
          ) : viewType === 'weekly' ? (
            /* Weekly Breakdown */
            <div className="mb-6">
              <h2 className="text-lg font-bold text-[#1F2937] mb-4">Daily Breakdown</h2>
              <div className="space-y-2">
                {getWeeklyBreakdown().map((day) => (
                  <div
                    key={day.date}
                    className="bg-[#F7F7F7] rounded-xl p-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#1F2937]">{day.dayName}</p>
                      <p className="text-xs text-[#6B7280]">
                        {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <p className={`text-xl font-bold ${day.profit >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                      {day.profit.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Monthly View */
            <div className="mb-6">
              <h2 className="text-lg font-bold text-[#1F2937] mb-4">30-Day Overview</h2>
              <div className="bg-[#F7F7F7] rounded-xl p-6">
                <div className="text-center">
                  <p className="text-sm text-[#6B7280] mb-2">Total Profit (Last 30 Days)</p>
                  <p className="text-4xl font-bold text-[#16A34A] mb-4">
                    KSh {getMonthProfit().toLocaleString()}
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    Track your business performance over time
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 10. Bottom CTA Section - Premium for Historical Insights */}
          {shouldShowPremiumCTA && (
            <div className="bg-gradient-to-r from-[#FBBF24] to-[#F59E0B] rounded-[20px] p-6 mb-5 shadow-lg">
              <div className="flex items-start gap-3">
                <Crown className="w-6 h-6 text-white flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <button
                    onClick={dismissPremiumCTA}
                    className="float-right text-white/80 hover:text-white p-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <h3 className="text-white font-bold text-lg mb-2">
                    Unlock Advanced Historical Insights
                  </h3>
                  <p className="text-white/90 text-sm mb-4">
                    Get detailed profit trends, stock performance analytics, and export reports
                  </p>
                  <button className="bg-white text-[#F59E0B] px-6 py-3 rounded-xl font-semibold hover:bg-[#F3F4F6] transition-colors">
                    Upgrade to Premium
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sign-In Prompt */}
          <AnimatePresence>
            {showSignInPrompt && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="bg-gradient-to-br from-[#3B82F6] to-[#2563EB] rounded-[20px] p-6 mb-5 text-white shadow-lg"
              >
                <div className="flex items-start gap-3">
                  <Calendar className="w-6 h-6 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-bold text-lg mb-2">
                      Save your data across devices
                    </h3>
                    <p className="text-sm mb-4 text-white/90">
                      Sign in to sync your historical data and stock cycles
                    </p>
                    <div className="flex gap-3">
                      <button className="bg-white text-[#2563EB] px-6 py-3 rounded-xl font-semibold hover:bg-[#F3F4F6] transition-colors">
                        Continue with Google
                      </button>
                      <button
                        onClick={dismissSignInPrompt}
                        className="text-white/90 hover:text-white px-4 py-3 rounded-xl hover:bg-white/10 transition-colors"
                      >
                        Later
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Service Upsell */}
          {products.length > 0 && (
            <div className="bg-gradient-to-br from-[#16A34A] to-[#15803D] rounded-[20px] p-6 mb-8 text-white shadow-lg">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-6 h-6 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-lg mb-2">
                    Want more customers for your business?
                  </h3>
                  <p className="text-sm mb-4 text-white/90">
                    Get a ready-to-sell online store
                  </p>
                  <button className="bg-white text-[#16A34A] px-6 py-3 rounded-xl font-semibold hover:bg-[#F3F4F6] transition-colors">
                    Get an online shop
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer Ad */}
          <div id="duka-ad-footer" className="mb-5 bg-[#F7F7F7] rounded-[16px] overflow-hidden border border-[#E5E7EB]">
            <div className="px-3 py-2 border-b border-[#E5E7EB] bg-white">
              <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wide text-center">Advertisement</p>
            </div>
            <div className="flex items-center justify-center h-[100px]">
              <p className="text-sm text-[#9CA3AF]">Ad Space</p>
            </div>
          </div>
        </div>

        {/* Share Button */}
        {currentProfit > 0 && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            onClick={shareProfit}
            className="fixed bottom-6 right-6 bg-[#16A34A] text-white p-4 rounded-full shadow-lg hover:bg-[#15803D] transition-colors z-30"
            aria-label="Share profit"
          >
            <Share2 className="w-6 h-6" />
          </motion.button>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {modalType === 'addProduct' && (
          <AddProductModal
            onAdd={addProduct}
            onClose={() => setModalType(null)}
          />
        )}

        {modalType === 'startStock' && selectedProductId && (
          <StartStockModal
            product={products.find(p => p.id === selectedProductId)!}
            onStart={startStock}
            onClose={() => {
              setModalType(null);
              setSelectedProductId(null);
            }}
          />
        )}

        {modalType === 'trackUsageLoss' && selectedStockId && (
          <TrackUsageLossModal
            stock={stockCycles.find(s => s.id === selectedStockId)!}
            onUpdate={updateUsageLoss}
            onClose={() => {
              setModalType(null);
              setSelectedStockId(null);
            }}
          />
        )}

        {modalType === 'stockComplete' && selectedStockId && (
          <StockCompleteModal
            stock={stockCycles.find(s => s.id === selectedStockId)!}
            product={products.find(p => p.id === stockCycles.find(s => s.id === selectedStockId)?.productId)!}
            dailyRecords={dailyRecords}
            onClose={() => {
              setModalType(null);
              setSelectedStockId(null);
            }}
            onStartNew={() => {
              const stock = stockCycles.find(s => s.id === selectedStockId);
              if (stock) {
                setSelectedProductId(stock.productId);
                setModalType('startStock');
                setSelectedStockId(null);
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MonthlyReportsView({
  monthlyRecords,
  products,
  stockCycles,
  getMonthSummary,
}: {
  monthlyRecords: Record<string, {
    records: DailyRecord[];
    products: Map<string, Product>;
    stocks: Map<string, StockCycle>;
  }>;
  products: Product[];
  stockCycles: StockCycle[];
  getMonthSummary: (monthKey: string, records: DailyRecord[]) => any;
}) {
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const toggleMonth = (monthKey: string) => {
    const newExpanded = new Set(expandedMonths);
    if (newExpanded.has(monthKey)) {
      newExpanded.delete(monthKey);
    } else {
      newExpanded.add(monthKey);
    }
    setExpandedMonths(newExpanded);
  };

  const monthKeys = Object.keys(monthlyRecords).sort().reverse();

  const formatMonthLabel = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  if (monthKeys.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="w-16 h-16 text-[#D1D5DB] mx-auto mb-4" />
        <h3 className="font-semibold text-[#1F2937] mb-2">No Monthly Reports Yet</h3>
        <p className="text-sm text-[#6B7280] px-8">
          Start logging daily sales to generate monthly reports automatically
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 mb-6">
      <h2 className="text-lg font-bold text-[#1F2937] mb-4">Monthly Reports</h2>

      {monthKeys.map((monthKey) => {
        const monthData = monthlyRecords[monthKey];
        const summary = getMonthSummary(monthKey, monthData.records);
        const isExpanded = expandedMonths.has(monthKey);

        return (
          <div key={monthKey} className="bg-[#F7F7F7] rounded-[20px] overflow-hidden">
            {/* Month Header */}
            <button
              onClick={() => toggleMonth(monthKey)}
              className="w-full p-5 flex items-center justify-between hover:bg-[#EEEEEE] transition-colors"
            >
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-[#16A34A]" />
                <div className="text-left">
                  <h3 className="font-semibold text-[#1F2937]">{formatMonthLabel(monthKey)}</h3>
                  <p className="text-xs text-[#6B7280]">{summary.entriesCount} entries</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-[#16A34A]">
                  KSh {summary.totalProfit.toLocaleString()}
                </p>
                <ChevronRight
                  className={`w-5 h-5 text-[#6B7280] transition-transform ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                />
              </div>
            </button>

            {/* Expanded Content */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  {/* Monthly Summary Cards */}
                  <div className="px-5 pb-4">
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-white rounded-xl p-3">
                        <p className="text-xs text-[#6B7280] mb-1">Total Revenue</p>
                        <p className="text-lg font-bold text-[#1F2937]">
                          {summary.totalRevenue.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-white rounded-xl p-3">
                        <p className="text-xs text-[#6B7280] mb-1">Total Profit</p>
                        <p className="text-lg font-bold text-[#16A34A]">
                          {summary.totalProfit.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-white rounded-xl p-3">
                        <p className="text-xs text-[#6B7280] mb-1">Units Sold</p>
                        <p className="text-lg font-bold text-[#1F2937]">
                          {summary.totalUnitsSold}
                        </p>
                      </div>
                      <div className="bg-white rounded-xl p-3">
                        <p className="text-xs text-[#6B7280] mb-1">Losses</p>
                        <p className="text-lg font-bold text-[#DC2626]">
                          {summary.totalLosses.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl p-3 mb-4">
                      <p className="text-xs text-[#6B7280] mb-1">Best Selling Product</p>
                      <p className="text-sm font-semibold text-[#1F2937]">
                        {summary.bestSellingProduct}
                      </p>
                    </div>

                    {/* Monthly Sales Table - Full Details */}
                    <div className="bg-white rounded-xl overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[700px]">
                          <thead className="bg-[#16A34A] text-white sticky top-0 z-10">
                            <tr>
                              <th className="px-2 py-3 text-left text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Date</th>
                              <th className="px-2 py-3 text-left text-[10px] font-semibold uppercase tracking-wide">Product</th>
                              <th className="px-2 py-3 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Units Sold</th>
                              <th className="px-2 py-3 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Sell Price</th>
                              <th className="px-2 py-3 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Cost/Unit</th>
                              <th className="px-2 py-3 text-right text-[10px] font-semibold uppercase tracking-wide">Profit</th>
                              <th className="px-2 py-3 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Usage/Loss</th>
                              <th className="px-2 py-3 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Stock Left</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E5E7EB]">
                            {monthData.records.map((record, index) => {
                              const product = products.find(p => p.id === record.productId);
                              const stock = stockCycles.find(s => s.id === record.stockId);

                              if (!product || !stock) return null;

                              const costPerUnit = stock.totalCost / stock.totalUnits;
                              const profit = record.unitsSold * (product.sellingPrice - costPerUnit);
                              const usageLoss = record.unitsUsed + record.unitsLost;

                              // Calculate remaining stock at that point in time
                              const allRecordsUpToDate = monthData.records.filter(r =>
                                r.stockId === stock.id && r.date <= record.date
                              );
                              const soldUpToDate = allRecordsUpToDate.reduce((sum, r) => sum + r.unitsSold, 0);
                              const usedUpToDate = allRecordsUpToDate.reduce((sum, r) => sum + r.unitsUsed, 0);
                              const lostUpToDate = allRecordsUpToDate.reduce((sum, r) => sum + r.unitsLost, 0);
                              const remainingStock = stock.totalUnits - (soldUpToDate + usedUpToDate + lostUpToDate);

                              return (
                                <tr
                                  key={`${record.date}-${record.productId}-${index}`}
                                  className={index % 2 === 0 ? 'bg-white hover:bg-[#F9FAFB]' : 'bg-[#F9FAFB] hover:bg-[#F3F4F6]'}
                                >
                                  <td className="px-2 py-3 text-xs text-[#6B7280] whitespace-nowrap">
                                    {new Date(record.date).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                  </td>
                                  <td className="px-2 py-3 text-xs font-medium text-[#1F2937]">
                                    {product.name}
                                  </td>
                                  <td className="px-2 py-3 text-xs text-right text-[#1F2937] font-semibold">
                                    {record.unitsSold}
                                  </td>
                                  <td className="px-2 py-3 text-xs text-right text-[#6B7280] whitespace-nowrap">
                                    KSh {product.sellingPrice.toLocaleString()}
                                  </td>
                                  <td className="px-2 py-3 text-xs text-right text-[#DC2626] whitespace-nowrap">
                                    KSh {costPerUnit.toFixed(2)}
                                  </td>
                                  <td className="px-2 py-3 text-xs text-right font-bold text-[#16A34A] whitespace-nowrap">
                                    KSh {profit.toFixed(0)}
                                  </td>
                                  <td className="px-2 py-3 text-xs text-right text-[#F59E0B]">
                                    {usageLoss > 0 ? usageLoss : '-'}
                                  </td>
                                  <td className="px-2 py-3 text-xs text-right font-medium text-[#1F2937]">
                                    {remainingStock}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile scroll hint */}
                      <div className="bg-[#F0FDF4] border-t border-[#16A34A]/20 px-4 py-2">
                        <p className="text-[10px] text-[#16A34A] text-center">
                          ← Swipe left to see all columns →
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

function AddProductModal({
  onAdd,
  onClose,
}: {
  onAdd: (name: string, sellingPrice: number) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');

  const handleSubmit = () => {
    if (!name || !sellingPrice) return;
    onAdd(name, Number(sellingPrice));
  };

  const isValid = name && sellingPrice;

  return (
    <Modal title="Add Product" onClose={onClose}>
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-[#1F2937] mb-2">
            Product Name
          </label>
          <input
            type="text"
            placeholder="e.g. Soap"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border-2 border-[#E5E7EB] focus:border-[#16A34A] focus:outline-none"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1F2937] mb-2">
            Selling Price per Unit (KSh)
          </label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 50"
            value={sellingPrice}
            onChange={(e) => setSellingPrice(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border-2 border-[#E5E7EB] focus:border-[#16A34A] focus:outline-none text-lg"
          />
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!isValid}
        className="w-full py-4 bg-[#16A34A] text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#15803D] transition-colors text-lg"
      >
        Add Product
      </button>
    </Modal>
  );
}

function StartStockModal({
  product,
  onStart,
  onClose,
}: {
  product: Product;
  onStart: (productId: string, totalCost: number, totalUnits: number) => void;
  onClose: () => void;
}) {
  const [totalCost, setTotalCost] = useState('');
  const [totalUnits, setTotalUnits] = useState('');

  const costPerUnit = totalCost && totalUnits ? Number(totalCost) / Number(totalUnits) : 0;
  const profitPerUnit = costPerUnit ? product.sellingPrice - costPerUnit : 0;

  const handleSubmit = () => {
    if (!totalCost || !totalUnits) return;
    onStart(product.id, Number(totalCost), Number(totalUnits));
  };

  const isValid = totalCost && totalUnits;

  return (
    <Modal title={`Start Stock: ${product.name}`} onClose={onClose}>
      <div className="bg-[#F0FDF4] rounded-xl p-4 mb-6">
        <p className="text-sm text-[#065F46]">
          Starting today: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-[#1F2937] mb-2">
            Total Cost (KSh)
          </label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 2400"
            value={totalCost}
            onChange={(e) => setTotalCost(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border-2 border-[#E5E7EB] focus:border-[#16A34A] focus:outline-none text-lg"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1F2937] mb-2">
            Total Units
          </label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 48"
            value={totalUnits}
            onChange={(e) => setTotalUnits(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border-2 border-[#E5E7EB] focus:border-[#16A34A] focus:outline-none text-lg"
          />
        </div>
      </div>

      {profitPerUnit > 0 && (
        <div className="mb-6 p-5 bg-[#F0FDF4] rounded-[16px] border-l-4 border-[#16A34A]">
          <p className="text-sm text-[#6B7280] mb-1">Expected profit per unit</p>
          <p className="text-3xl font-bold text-[#16A34A]">
            KSh {profitPerUnit.toFixed(2)}
          </p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!isValid}
        className="w-full py-4 bg-[#16A34A] text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#15803D] transition-colors text-lg"
      >
        Start Stock Cycle
      </button>
    </Modal>
  );
}

function TrackUsageLossModal({
  stock,
  onUpdate,
  onClose,
}: {
  stock: StockCycle;
  onUpdate: (stockId: string, unitsUsed: number, unitsLost: number) => void;
  onClose: () => void;
}) {
  const [unitsUsed, setUnitsUsed] = useState('');
  const [unitsLost, setUnitsLost] = useState('');

  const handleSubmit = () => {
    const used = parseInt(unitsUsed) || 0;
    const lost = parseInt(unitsLost) || 0;
    if (used === 0 && lost === 0) return;
    onUpdate(stock.id, used, lost);
  };

  return (
    <Modal title="Track Usage & Loss" onClose={onClose}>
      <div className="bg-[#F0FDF4] rounded-xl p-4 mb-6">
        <p className="text-sm text-[#065F46]">
          Recording for: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-[#1F2937] mb-2 flex items-center gap-2">
            <Home className="w-4 h-4" />
            Units Used at Home
          </label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={unitsUsed}
            onChange={(e) => setUnitsUsed(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border-2 border-[#E5E7EB] focus:border-[#16A34A] focus:outline-none text-lg"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1F2937] mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Units Lost/Damaged
          </label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={unitsLost}
            onChange={(e) => setUnitsLost(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border-2 border-[#E5E7EB] focus:border-[#16A34A] focus:outline-none text-lg"
          />
        </div>
      </div>

      <button
        onClick={handleSubmit}
        className="w-full py-4 bg-[#16A34A] text-white font-semibold rounded-xl hover:bg-[#15803D] transition-colors text-lg"
      >
        Update Stock
      </button>
    </Modal>
  );
}

function StockCompleteModal({
  stock,
  product,
  dailyRecords,
  onClose,
  onStartNew,
}: {
  stock: StockCycle;
  product: Product;
  dailyRecords: DailyRecord[];
  onClose: () => void;
  onStartNew: () => void;
}) {
  const stockRecords = dailyRecords.filter(r => r.stockId === stock.id);
  const totalSold = stockRecords.reduce((sum, r) => sum + r.unitsSold, 0);
  const totalUsed = stockRecords.reduce((sum, r) => sum + r.unitsUsed, 0);
  const totalLost = stockRecords.reduce((sum, r) => sum + r.unitsLost, 0);

  const revenue = totalSold * product.sellingPrice;
  const trueProfit = revenue - stock.totalCost;
  const lossValue = totalLost * (stock.totalCost / stock.totalUnits);

  const duration = stock.endDate
    ? Math.ceil((new Date(stock.endDate).getTime() - new Date(stock.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0;

  return (
    <Modal title="Stock Cycle Complete" onClose={onClose}>
      <div className="bg-[#F0FDF4] rounded-xl p-4 mb-6">
        <p className="text-xs text-[#6B7280] mb-1">Duration</p>
        <p className="text-sm font-semibold text-[#065F46]">
          {new Date(stock.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {stock.endDate && new Date(stock.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          <span className="ml-2">({duration} days)</span>
        </p>
      </div>

      <div className="space-y-4 mb-6">
        <div className="bg-gradient-to-br from-[#16A34A] to-[#15803D] rounded-[16px] p-5 text-white">
          <p className="text-sm opacity-90 mb-1">Final Profit</p>
          <p className="text-4xl font-bold">
            KSh {trueProfit.toLocaleString()}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#F7F7F7] rounded-xl p-4">
            <p className="text-xs text-[#6B7280] mb-1">Total Sold</p>
            <p className="text-xl font-bold text-[#1F2937]">{totalSold}</p>
          </div>

          <div className="bg-[#F7F7F7] rounded-xl p-4">
            <p className="text-xs text-[#6B7280] mb-1">Revenue</p>
            <p className="text-xl font-bold text-[#1F2937]">
              {revenue.toLocaleString()}
            </p>
          </div>

          <div className="bg-[#F7F7F7] rounded-xl p-4">
            <p className="text-xs text-[#6B7280] mb-1">Used at Home</p>
            <p className="text-xl font-bold text-[#1F2937]">{totalUsed}</p>
          </div>

          <div className="bg-[#F7F7F7] rounded-xl p-4">
            <p className="text-xs text-[#6B7280] mb-1">Lost/Damaged</p>
            <p className="text-xl font-bold text-[#DC2626]">{totalLost}</p>
          </div>
        </div>

        {/* Insights */}
        <div className="space-y-2">
          {totalUsed > 0 && (
            <div className="bg-[#FEF3C7] border-l-4 border-[#F59E0B] rounded-xl p-3">
              <p className="text-sm text-[#92400E]">
                You used {totalUsed} items at home
              </p>
            </div>
          )}

          {totalLost > 0 && (
            <div className="bg-[#FEE2E2] border-l-4 border-[#DC2626] rounded-xl p-3">
              <p className="text-sm text-[#991B1B]">
                Losses reduced your profit by KSh {lossValue.toFixed(0)}
              </p>
            </div>
          )}

          <div className="bg-[#F0FDF4] border-l-4 border-[#16A34A] rounded-xl p-3">
            <p className="text-sm text-[#065F46]">
              You made KSh {trueProfit.toLocaleString()} from this stock in {duration} days
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-3 bg-white border-2 border-[#E5E7EB] text-[#6B7280] font-semibold rounded-xl hover:bg-[#F9FAFB] transition-colors"
        >
          Close
        </button>
        <button
          onClick={onStartNew}
          className="flex-1 py-3 bg-[#16A34A] text-white font-semibold rounded-xl hover:bg-[#15803D] transition-colors"
        >
          Start New Stock
        </button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%', scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: '100%', scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-md rounded-[24px] max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        <div className="sticky top-0 bg-white border-b border-[#E5E7EB] px-6 py-4 flex items-center justify-between rounded-t-[24px] z-10">
          <h2 className="text-xl font-bold text-[#1F2937]">{title}</h2>
          <button
            onClick={onClose}
            className="text-[#6B7280] hover:bg-[#F3F4F6] p-2 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">{children}</div>
      </motion.div>
    </motion.div>
  );
}
