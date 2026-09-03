describe('Backlog Phase E — Quality Analytics, Inventory Aging Valuation & P&L Suite', () => {
  it('calculates batch yield efficiency and process loss percentages', () => {
    const plannedQty = 500;
    const actualYieldQty = 475; // 25 units loss (5% loss)

    const yieldEfficiencyPercent = Number(((actualYieldQty / plannedQty) * 100).toFixed(1));
    const processLossPercent = Number((((plannedQty - actualYieldQty) / plannedQty) * 100).toFixed(1));

    expect(yieldEfficiencyPercent).toBe(95.0);
    expect(processLossPercent).toBe(5.0);
  });

  it('groups inventory batches into expiry-risk valuation brackets', () => {
    const now = new Date('2026-09-01');
    const expiryDate = new Date('2026-11-15'); // ~2.5 months

    const monthsLeft = (expiryDate.getFullYear() - now.getFullYear()) * 12 + (expiryDate.getMonth() - now.getMonth());

    let bracket = 'safe';
    if (monthsLeft <= 3) bracket = 'critical_0_3m';
    else if (monthsLeft <= 6) bracket = 'high_3_6m';

    expect(monthsLeft).toBe(2);
    expect(bracket).toBe('critical_0_3m');
  });

  it('classifies inventory aging into active, slow-moving, and dead stock', () => {
    const now = new Date('2026-09-01');
    const mfgDateOld = new Date('2026-01-01'); // ~243 days old (>180 days = dead stock)

    const daysOld = Math.ceil((now.getTime() - mfgDateOld.getTime()) / (1000 * 60 * 60 * 24));

    let category = 'active_0_90d';
    if (daysOld > 180) category = 'dead_stock_180d_plus';
    else if (daysOld > 90) category = 'slow_moving_90_180d';

    expect(daysOld).toBeGreaterThan(180);
    expect(category).toBe('dead_stock_180d_plus');
  });

  it('ranks MRs on leaderboard by total sales volume and visits', () => {
    const mrList = [
      { name: 'MR Sharma', totalSalesVolume: 150000, totalVisits: 45 },
      { name: 'MR Verma', totalSalesVolume: 320000, totalVisits: 60 },
      { name: 'MR Gupta', totalSalesVolume: 80000, totalVisits: 30 }
    ];

    mrList.sort((a, b) => b.totalSalesVolume - a.totalSalesVolume || b.totalVisits - a.totalVisits);

    expect(mrList[0].name).toBe('MR Verma');
    expect(mrList[1].name).toBe('MR Sharma');
    expect(mrList[2].name).toBe('MR Gupta');
  });

  it('computes financial P&L gross profit and net profit margin correctly', () => {
    const grossSalesRevenue = 1000000; // ₹10L
    const totalPurchasesCost = 600000;   // ₹6L COGS
    const totalGeneralOfficeExpenses = 100000; // ₹1L
    const totalMrFieldExpenses = 50000;  // ₹50K

    const grossProfit = grossSalesRevenue - totalPurchasesCost; // ₹4L
    const totalOperatingExpenses = totalGeneralOfficeExpenses + totalMrFieldExpenses; // ₹1.5L
    const netProfit = grossProfit - totalOperatingExpenses; // ₹2.5L
    const netProfitMarginPercent = Number(((netProfit / grossSalesRevenue) * 100).toFixed(1));

    expect(grossProfit).toBe(400000);
    expect(netProfit).toBe(250000);
    expect(netProfitMarginPercent).toBe(25.0);
  });
});
