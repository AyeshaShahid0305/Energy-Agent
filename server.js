require("dotenv").config();
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const path = require("path");

const app = express();
const client = new Anthropic();

app.use(express.json());
app.use(express.static("public"));

const NEPRA_SLABS = [
  { upTo: 100, rate: 7.74 },
  { upTo: 200, rate: 10.06 },
  { upTo: 300, rate: 15.09 },
  { upTo: 400, rate: 19.55 },
  { upTo: 500, rate: 22.65 },
  { upTo: 600, rate: 25.19 },
  { upTo: 700, rate: 27.14 },
  { upTo: Infinity, rate: 28.01 },
];

const APPLIANCES = {
  ac_1ton: { name: "AC 1 Ton", watts: 1500 },
  ac_1_5ton: { name: "AC 1.5 Ton", watts: 2000 },
  ac_2ton: { name: "AC 2 Ton", watts: 2500 },
  geyser: { name: "Electric Geyser", watts: 3000 },
  fridge: { name: "Refrigerator", watts: 150 },
  washing_machine: { name: "Washing Machine", watts: 500 },
  iron: { name: "Iron", watts: 1000 },
  fan: { name: "Ceiling Fan", watts: 75 },
  led_bulb: { name: "LED Bulb", watts: 15 },
  motor: { name: "Water Motor", watts: 750 },
  tv: { name: "LED TV", watts: 100 },
  microwave: { name: "Microwave", watts: 1200 },
};

function calculateBill(units) {
  let bill = 0;
  let remaining = units;
  let prevSlab = 0;

  for (const slab of NEPRA_SLABS) {
    if (remaining <= 0) break;
    const inSlab = Math.min(remaining, slab.upTo - prevSlab);
    bill += inSlab * slab.rate;
    remaining -= inSlab;
    prevSlab = slab.upTo;
  }

  const fuelAdjustment = units * 3.23;
  const electricityDuty = bill * 0.015;
  const tvFee = 35;
  const meterRent = 15;

  return {
    unitCost: Math.round(bill),
    fuelAdjustment: Math.round(fuelAdjustment),
    electricityDuty: Math.round(electricityDuty),
    tvFee,
    meterRent,
    total: Math.round(bill + fuelAdjustment + electricityDuty + tvFee + meterRent),
  };
}

function calcAppliance(applianceKey, hoursPerDay) {
  const appliance = APPLIANCES[applianceKey];
  if (!appliance) return null;
  const unitsPerDay = (appliance.watts * hoursPerDay) / 1000;
  const unitsPerMonth = unitsPerDay * 30;
  const bill = calculateBill(unitsPerMonth);
  return {
    name: appliance.name,
    unitsPerDay: unitsPerDay.toFixed(2),
    unitsPerMonth: unitsPerMonth.toFixed(2),
    costPerDay: Math.round((bill.total / 30)),
    costPerMonth: bill.total,
  };
}

function solarAdvisor(monthlyUnits, city) {
  const peakSunHours = { lahore: 5.2, karachi: 5.8, islamabad: 4.9, peshawar: 5.1, quetta: 6.2, multan: 5.5 };
  const sunHours = peakSunHours[city.toLowerCase()] || 5.0;
  const systemKW = (monthlyUnits / (sunHours * 30)) * 1.25;
  const costPerKW = 120000;
  const systemCost = Math.round(systemKW * costPerKW);
  const monthlyBill = calculateBill(monthlyUnits).total;
  const annualSavings = monthlyBill * 12;
  const paybackYears = (systemCost / annualSavings).toFixed(1);

  return {
    recommendedKW: systemKW.toFixed(1),
    estimatedCost: systemCost,
    monthlySavings: monthlyBill,
    annualSavings,
    paybackYears,
    panels: Math.ceil(systemKW / 0.4),
  };
}

app.post("/api/chat", async (req, res) => {
  const { message, history = [] } = req.body;

  const systemPrompt = `You are a Smart Energy Advisor for Pakistan. You help Pakistani households save money on electricity bills.

You know:
- NEPRA tariff slabs (100/200/300/400/500/600/700+ units)
- Common appliances: AC (1-2 ton), geyser, fridge, motor, fan, iron
- Load shedding impact on different DISCOs (LESCO, MEPCO, FESCO, GEPCO, HESCO, QESCO, PESCO)
- Solar net metering in Pakistan
- Gas vs electric geyser comparison for winter
- Peak hours (7pm-11pm most expensive)

Available tools you can suggest:
- Bill Calculator: user enters monthly units
- Appliance Tracker: user selects appliances and hours used
- Solar Advisor: based on usage and city

Give advice in simple English or Urdu mix (Roman Urdu is fine). Be specific with Rs. amounts.
Always give 2-3 actionable tips to save money.`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [...history, { role: "user", content: message }],
    });

    res.json({ reply: response.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/bill", (req, res) => {
  const { units } = req.body;
  res.json(calculateBill(Number(units)));
});

app.post("/api/appliance", (req, res) => {
  const { appliance, hours } = req.body;
  res.json(calcAppliance(appliance, Number(hours)));
});

app.post("/api/solar", (req, res) => {
  const { units, city } = req.body;
  res.json(solarAdvisor(Number(units), city));
});

app.get("/api/appliances", (req, res) => {
  res.json(APPLIANCES);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Energy Agent running at http://localhost:${PORT}`));