import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AppData, CollabTrip, PrivateTrip, Expense, PaymentReceived } from '../App';

export interface PDFExportOptions {
  data: AppData;
  dateFilterLabel: string;
}

function formatPdfCurrency(amount: number, symbol: string): string {
  // Convert '₹' or empty symbol to 'Rs. ' to prevent jsPDF font encoding issues (which render '₹' as superscript '1')
  const cleanSym = (!symbol || symbol === '₹') ? 'Rs. ' : (symbol.endsWith(' ') ? symbol : `${symbol} `);
  const formattedNumber = Math.round(amount).toLocaleString('en-IN');
  return `${cleanSym}${formattedNumber}`;
}

export function generateAccountingPDF({ data, dateFilterLabel }: PDFExportOptions) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const sym = data.settings.currencySymbol || '₹';
  const owner = data.settings.ownerName || 'Vehicle Owner';
  const vehicle = data.settings.vehicleRegNo || 'TIPPER-01';
  const nowStr = new Date().toLocaleString();

  // Colors
  const primaryColor: [number, number, number] = [245, 158, 11]; // Amber 500
  const darkBg: [number, number, number] = [24, 24, 27]; // Zinc 900
  const textDark: [number, number, number] = [39, 39, 42]; // Zinc 800

  // 1. Header Banner
  doc.setFillColor(...darkBg);
  doc.rect(0, 0, 210, 32, 'F');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('TIPPERLOG', 14, 15);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(245, 158, 11);
  doc.text('ACCOUNTING LEDGER & FINANCIAL REPORT', 14, 22);

  // Vehicle info right-aligned
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(`Vehicle: ${vehicle}`, 196, 14, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(161, 161, 170);
  doc.text(`Owner: ${owner}`, 196, 20, { align: 'right' });
  doc.text(`Period: ${dateFilterLabel} | Generated: ${nowStr}`, 196, 26, { align: 'right' });

  let yPos = 38;

  // Calculate Totals
  const totalCollabRev = data.collabTrips.reduce((acc, t) => acc + (t.totalAmount || 0), 0);
  const totalPrivateRev = data.privateTrips.reduce((acc, t) => acc + (t.totalAmount || 0), 0);
  const grossRevenue = totalCollabRev + totalPrivateRev;

  const totalCollabFuel = data.collabTrips.reduce((acc, t) => acc + (t.fuelExpense || 0), 0);
  const totalCollabDriver = data.collabTrips.reduce((acc, t) => acc + (t.driverPay || 0), 0);
  const totalPrivateExtraFuel = data.privateTrips.reduce((acc, t) => acc + (t.extraFuelCost || 0), 0);
  const totalDirectExpenses = data.expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
  const totalExpenses = totalCollabFuel + totalCollabDriver + totalPrivateExtraFuel + totalDirectExpenses;

  const totalPaymentsReceived = data.paymentsReceived.reduce((acc, p) => acc + (p.amount || 0), 0);
  const netProfit = grossRevenue - totalExpenses;

  const totalCollabTripsCount = data.collabTrips.reduce((acc, t) => acc + (t.tripsCount || 0), 0);
  const totalPrivateTripsCount = data.privateTrips.reduce((acc, t) => acc + (t.tripsCount || 0), 0);
  const totalTripsCount = totalCollabTripsCount + totalPrivateTripsCount;

  // 2. Executive Financial Summary Cards
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...textDark);
  doc.text('1. Executive Financial Summary', 14, yPos);
  yPos += 4;

  autoTable(doc, {
    startY: yPos,
    margin: { left: 14, right: 14 },
    head: [['Metric Description', 'Trips / Count', 'Amount']],
    body: [
      ['Gross Earnings (Collab Trips)', `${totalCollabTripsCount} trips`, formatPdfCurrency(totalCollabRev, sym)],
      ['Gross Earnings (Private Trips)', `${totalPrivateTripsCount} trips`, formatPdfCurrency(totalPrivateRev, sym)],
      ['TOTAL GROSS REVENUE', `${totalTripsCount} total trips`, formatPdfCurrency(grossRevenue, sym)],
      ['Fuel Costs (Collab + Private Extra)', '-', formatPdfCurrency(totalCollabFuel + totalPrivateExtraFuel, sym)],
      ['Driver Pay & Direct Operating Expenses', '-', formatPdfCurrency(totalCollabDriver + totalDirectExpenses, sym)],
      ['TOTAL OPERATING EXPENSES', '-', formatPdfCurrency(totalExpenses, sym)],
      ['NET OPERATING PROFIT', '-', formatPdfCurrency(netProfit, sym)],
      ['TOTAL PAYMENTS RECEIVED FROM COLLABS', `${data.paymentsReceived.length} receipts`, formatPdfCurrency(totalPaymentsReceived, sym)]
    ],
    theme: 'grid',
    styles: { cellPadding: 2, fontSize: 8.5, overflow: 'linebreak' },
    headStyles: {
      fillColor: [39, 39, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [39, 39, 42]
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 98 },
      1: { cellWidth: 38, halign: 'center' },
      2: { cellWidth: 46, halign: 'right', fontStyle: 'bold' }
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + 8;

  // 3. Collaborator Summary Breakdown
  if (data.collaborators && data.collaborators.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...textDark);
    doc.text('2. Collaborator Balances & Settlement Overview', 14, yPos);
    yPos += 4;

    const collabRows = data.collaborators.map((c) => {
      const cTrips = data.collabTrips.filter((t) => t.collaboratorId === c.id);
      const totalEarned = cTrips.reduce((acc, t) => acc + t.totalAmount, 0);
      const tripsCount = cTrips.reduce((acc, t) => acc + t.tripsCount, 0);
      const cPayments = data.paymentsReceived.filter((p) => p.collaboratorId === c.id);
      const paid = cPayments.reduce((acc, p) => acc + p.amount, 0);
      const due = totalEarned - paid;

      return [
        c.name,
        c.phone || '-',
        `${tripsCount} trips`,
        formatPdfCurrency(totalEarned, sym),
        formatPdfCurrency(paid, sym),
        formatPdfCurrency(due, sym)
      ];
    });

    autoTable(doc, {
      startY: yPos,
      margin: { left: 14, right: 14 },
      head: [['Collaborator Name', 'Phone', 'Total Trips', 'Earned', 'Paid Received', 'Unsettled Due']],
      body: collabRows,
      theme: 'grid',
      styles: { cellPadding: 2, fontSize: 8, overflow: 'linebreak' },
      headStyles: {
        fillColor: [217, 119, 6], // Amber 600
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [39, 39, 42]
      },
      columnStyles: {
        0: { cellWidth: 38, fontStyle: 'bold' },
        1: { cellWidth: 26 },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: 32, halign: 'right' },
        5: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 8;
  }

  // Check page break for itemized ledger
  if (yPos > 210) {
    doc.addPage();
    yPos = 20;
  }

  // 3. Detailed Itemized Transaction Ledger
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...textDark);
  doc.text('3. Detailed Transaction Ledger', 14, yPos);
  yPos += 6;

  // Helper page break checker
  const checkPageBreak = (neededHeight: number) => {
    if (yPos + neededHeight > 270) {
      doc.addPage();
      yPos = 20;
    }
  };

  // 3.1 Collaborator Trips Table
  if (data.collabTrips.length > 0) {
    checkPageBreak(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(39, 39, 42);
    doc.text('3.1 Collaborator Trips', 14, yPos);
    yPos += 3;

    const collabSorted = [...data.collabTrips].sort((a, b) => (b.timestamp || new Date(b.date).getTime()) - (a.timestamp || new Date(a.date).getTime()));
    const collabRows = collabSorted.map((t) => [
      t.date,
      t.collaboratorName || 'Collaborator',
      `${t.shift} Shift`,
      `${t.tripsCount}`,
      formatPdfCurrency(t.totalAmount, sym),
      formatPdfCurrency((t.fuelExpense || 0) + (t.driverPay || 0), sym),
      formatPdfCurrency(t.totalAmount - ((t.fuelExpense || 0) + (t.driverPay || 0)), sym)
    ]);

    autoTable(doc, {
      startY: yPos,
      margin: { left: 14, right: 14 },
      head: [['Date', 'Collaborator Name', 'Shift', 'Trips', 'Gross Rev', 'Fuel/Pay Exp', 'Net Impact']],
      body: collabRows,
      theme: 'grid',
      styles: { cellPadding: 1.5, fontSize: 7.5, overflow: 'linebreak' },
      headStyles: {
        fillColor: [39, 39, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [39, 39, 42]
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 48, fontStyle: 'bold' },
        2: { cellWidth: 22 },
        3: { cellWidth: 16, halign: 'center' },
        4: { cellWidth: 24, halign: 'right' },
        5: { cellWidth: 24, halign: 'right' },
        6: { cellWidth: 26, halign: 'right', fontStyle: 'bold' }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 8;
  }

  // 3.2 Payouts Received Table
  if (data.paymentsReceived.length > 0) {
    checkPageBreak(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(217, 119, 6); // Amber tone for Payouts
    doc.text('3.2 Payouts Received (Collaborator Settlements)', 14, yPos);
    yPos += 3;

    const payoutSorted = [...data.paymentsReceived].sort((a, b) => (b.timestamp || new Date(b.date).getTime()) - (a.timestamp || new Date(a.date).getTime()));
    const payoutRows = payoutSorted.map((pr) => [
      pr.date,
      pr.collaboratorName || 'Collaborator',
      pr.referenceNote || 'Collaborator Payout',
      formatPdfCurrency(pr.amount, sym)
    ]);

    autoTable(doc, {
      startY: yPos,
      margin: { left: 14, right: 14 },
      head: [['Date', 'Collaborator Name', 'Payment Note / Reference', 'Amount Received']],
      body: payoutRows,
      theme: 'grid',
      styles: { cellPadding: 1.5, fontSize: 7.5, overflow: 'linebreak' },
      headStyles: {
        fillColor: [217, 119, 6],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [39, 39, 42]
      },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 50, fontStyle: 'bold' },
        2: { cellWidth: 72 },
        3: { cellWidth: 36, halign: 'right', fontStyle: 'bold' }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 8;
  }

  // 3.3 Private Trips Table
  if (data.privateTrips.length > 0) {
    checkPageBreak(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(16, 185, 129); // Emerald tone for Private Trips
    doc.text('3.3 Private Trips (Direct Cash Work)', 14, yPos);
    yPos += 3;

    const privateSorted = [...data.privateTrips].sort((a, b) => (b.timestamp || new Date(b.date).getTime()) - (a.timestamp || new Date(a.date).getTime()));
    const privateRows = privateSorted.map((p) => [
      p.date,
      p.customerName || 'Customer',
      `${p.tripsCount}`,
      formatPdfCurrency(p.totalAmount, sym),
      formatPdfCurrency(p.extraFuelCost || 0, sym),
      formatPdfCurrency(p.totalAmount - (p.extraFuelCost || 0), sym)
    ]);

    autoTable(doc, {
      startY: yPos,
      margin: { left: 14, right: 14 },
      head: [['Date', 'Customer Name', 'Trips', 'Gross Rev', 'Extra Fuel', 'Net Rev']],
      body: privateRows,
      theme: 'grid',
      styles: { cellPadding: 1.5, fontSize: 7.5, overflow: 'linebreak' },
      headStyles: {
        fillColor: [16, 185, 129],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [39, 39, 42]
      },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 62, fontStyle: 'bold' },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 26, halign: 'right' },
        4: { cellWidth: 26, halign: 'right' },
        5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 8;
  }

  // 3.4 Direct Operating Expenses Table
  if (data.expenses.length > 0) {
    checkPageBreak(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(225, 29, 72); // Rose tone for Expenses
    doc.text('3.4 Operating Expenses', 14, yPos);
    yPos += 3;

    const expSorted = [...data.expenses].sort((a, b) => (b.timestamp || new Date(b.date).getTime()) - (a.timestamp || new Date(a.date).getTime()));
    const expRows = expSorted.map((e) => [
      e.date,
      e.category,
      e.notes || 'Operating Expense',
      formatPdfCurrency(e.amount, sym)
    ]);

    autoTable(doc, {
      startY: yPos,
      margin: { left: 14, right: 14 },
      head: [['Date', 'Category', 'Description / Notes', 'Amount Paid']],
      body: expRows,
      theme: 'grid',
      styles: { cellPadding: 1.5, fontSize: 7.5, overflow: 'linebreak' },
      headStyles: {
        fillColor: [225, 29, 72],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [39, 39, 42]
      },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 44, fontStyle: 'bold' },
        2: { cellWidth: 78 },
        3: { cellWidth: 36, halign: 'right', fontStyle: 'bold' }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 8;
  }

  // Footer page numbers
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(161, 161, 170);
    doc.text(
      `TipperLog Accounting Report | Page ${i} of ${pageCount}`,
      105,
      290,
      { align: 'center' }
    );
  }

  // Save the generated PDF
  const sanitizedVehicle = vehicle.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`TipperLog_Ledger_${sanitizedVehicle}_${Date.now()}.pdf`);
}

