export type WorkerListRow = {
  id: string;
  profileId: string;
  name: string;
  experience?: string;
  email: string;
  phone: string;
  assignmentStartDate?: string;
  assignmentEndDate?: string;
  jobRole: string;
  jobId?: string | null;
  payRate?: string;
  status: string;
  client?: string;
  manager?: string;
  facilities?: string[];
  location?: string;
  createdAt: string | null;
  profilePhotoUrl?: string | null;
  workerType?: string;
  employmentType?: string;
  reference?: string;
  assignment?: string;
  hiredDate?: string;
  billRate?: string;
  department?: string;
  specialty?: string;
  profession?: string;
  shiftType?: string;
  shiftDetails?: string;
  hoursPerWeek?: string;
  overtimeRate?: string;
  documentsCount?: number;
};

export const FIGMA_METRIC_COUNTS = {
  active: 128,
  inactive: 79,
  assigned: 18,
  newlyOnboarded: 25,
};

const BASE_DEMO_WORKERS: WorkerListRow[] = [
  {
    id: "demo-w-1",
    profileId: "demo-w-1",
    name: "Michael Anderson",
    experience: "4 yrs experience",
    email: "michael.anderson@example.com",
    phone: "(212) 555-0101",
    assignmentStartDate: "05/23/2026",
    assignmentEndDate: "05/23/2026",
    jobRole: "IT Project Manager",
    jobId: "demo-job-1",
    payRate: "$30/hr",
    status: "Active",
    client: "Lennox",
    manager: "Sean J.",
    facilities: ["Lennox Corporate HQ", "Lennox Center"],
    location: "Dallas, TX",
    createdAt: "2026-05-23T08:00:00Z",
    workerType: "W-2",
    employmentType: "Full-time",
    reference: "WRK-001",
  },
  {
    id: "demo-w-2",
    profileId: "demo-w-2",
    name: "Jessica Williams",
    experience: "4 yrs experience",
    email: "jessica.williams@example.com",
    phone: "(310) 555-0102",
    assignmentStartDate: "05/23/2026",
    assignmentEndDate: "05/23/2026",
    jobRole: "Oracle Fusion ERP Admin",
    jobId: "demo-job-2",
    payRate: "$30/hr",
    status: "Active",
    client: "Lennox",
    manager: "Sean J.",
    facilities: ["Lennox Main Campus"],
    location: "Los Angeles, CA",
    createdAt: "2026-05-23T08:00:00Z",
    workerType: "1099",
    employmentType: "Contract",
    reference: "WRK-002",
  },
  {
    id: "demo-w-3",
    profileId: "demo-w-3",
    name: "Daniel Thompson",
    experience: "2 yrs experience",
    email: "daniel.thompson@example.com",
    phone: "(512) 555-0103",
    assignmentStartDate: "05/23/2026",
    assignmentEndDate: "05/23/2026",
    jobRole: "IT Project Manager",
    jobId: "demo-job-1",
    payRate: "$30/hr",
    status: "Active",
    client: "Lennox",
    manager: "Sean J.",
    facilities: ["Lennox Logistics Center"],
    location: "Austin, TX",
    createdAt: "2026-05-23T08:00:00Z",
    workerType: "W-2",
    employmentType: "Full-time",
    reference: "WRK-003",
  },
  {
    id: "demo-w-4",
    profileId: "demo-w-4",
    name: "Jash Ketan Be Rawala",
    experience: "4 yrs experience",
    email: "jashkberawala@gmail.com",
    phone: "(852) 388-5181",
    assignmentStartDate: "05/23/2026",
    assignmentEndDate: "05/23/2026",
    jobRole: "Backend Java / Software Engineer",
    jobId: "demo-job-3",
    payRate: "$30/hr",
    status: "Active",
    client: "Lennox",
    manager: "Sean J.",
    facilities: ["Lennox Tech Park"],
    location: "Charlotte, NC",
    createdAt: "2026-05-23T08:00:00Z",
    workerType: "1099",
    employmentType: "Contract",
    reference: "WRK-004",
  },
  {
    id: "demo-w-5",
    profileId: "demo-w-5",
    name: "Sankeerth Kumar Eswaravaka",
    experience: "6 yrs experience",
    email: "sankeertheswaravaka@gmail.com",
    phone: "(214) 297-7140",
    assignmentStartDate: "05/23/2026",
    assignmentEndDate: "05/23/2026",
    jobRole: "Software Engineer",
    jobId: "demo-job-4",
    payRate: "$30/hr",
    status: "Active",
    client: "Freddie Mac",
    manager: "Amanda Miller",
    facilities: ["Freddie Mac HQ - McLean"],
    location: "McLean, VA",
    createdAt: "2026-05-23T08:00:00Z",
    workerType: "W-2",
    employmentType: "Full-time",
    reference: "WRK-005",
  },
  {
    id: "demo-w-6",
    profileId: "demo-w-6",
    name: "Mahidhar Reddy Allampati",
    experience: "5 yrs experience",
    email: "mahidharallampati10@gmail.com",
    phone: "(913) 260-7300",
    assignmentStartDate: "05/23/2026",
    assignmentEndDate: "05/23/2026",
    jobRole: "Medical Assistant",
    jobId: "demo-job-5",
    payRate: "$30/hr",
    status: "Active",
    client: "Freddie Mac",
    manager: "Amanda Miller",
    facilities: ["Freddie Mac Medical Wing"],
    location: "Overland Park, KS",
    createdAt: "2026-05-23T08:00:00Z",
    workerType: "W-2",
    employmentType: "Full-time",
    reference: "WRK-006",
  },
  {
    id: "demo-w-7",
    profileId: "demo-w-7",
    name: "David Miller",
    experience: "2 yrs experience",
    email: "david.miller@example.com",
    phone: "(913) 260-7300",
    assignmentStartDate: "05/23/2026",
    assignmentEndDate: "05/23/2026",
    jobRole: "Production Supervisor",
    jobId: "demo-job-6",
    payRate: "$40/hr",
    status: "Active",
    client: "Freddie Mac",
    manager: "Sean J.",
    facilities: ["Freddie Mac Campus"],
    location: "Kansas City, MO",
    createdAt: "2026-05-23T08:00:00Z",
    workerType: "W-2",
    employmentType: "Full-time",
    reference: "WRK-007",
  },
  {
    id: "demo-w-8",
    profileId: "demo-w-8",
    name: "Amanda Wilson",
    experience: "2 yrs experience",
    email: "amanda.wilson@example.com",
    phone: "(913) 260-7300",
    assignmentStartDate: "05/23/2026",
    assignmentEndDate: "05/23/2026",
    jobRole: "Recruitment Coordinator",
    jobId: "demo-job-7",
    payRate: "$40/hr",
    status: "Active",
    client: "Freddie Mac",
    manager: "Amanda Miller",
    facilities: ["Freddie Mac HR Center"],
    location: "New York, NY",
    createdAt: "2026-05-23T08:00:00Z",
    workerType: "W-2",
    employmentType: "Full-time",
    reference: "WRK-008",
  },
  {
    id: "demo-w-9",
    profileId: "demo-w-9",
    name: "Sophia Garcia",
    experience: "8 yrs experience",
    email: "sophia.garcia@example.com",
    phone: "(913) 260-7300",
    assignmentStartDate: "05/23/2026",
    assignmentEndDate: "05/23/2026",
    jobRole: "Property Manager",
    jobId: "demo-job-8",
    payRate: "$40/hr",
    status: "Active",
    client: "Freddie Mac",
    manager: "Sean J.",
    facilities: ["Freddie Mac Operations"],
    location: "Miami, FL",
    createdAt: "2026-05-23T08:00:00Z",
    workerType: "1099",
    employmentType: "Contract",
    reference: "WRK-009",
  },
  {
    id: "demo-w-10",
    profileId: "demo-w-10",
    name: "Isabella Clark",
    experience: "4 yrs experience",
    email: "isabella.clark@example.com",
    phone: "(913) 260-7300",
    assignmentStartDate: "05/23/2026",
    assignmentEndDate: "05/23/2026",
    jobRole: "Digital Marketing Specialist",
    jobId: "demo-job-9",
    payRate: "$50/hr",
    status: "Active",
    client: "Freddie Mac",
    manager: "Amanda Miller",
    facilities: ["Freddie Mac Marketing Hub"],
    location: "Chicago, IL",
    createdAt: "2026-05-23T08:00:00Z",
    workerType: "1099",
    employmentType: "Contract",
    reference: "WRK-010",
  },
];

// Generate up to 100 demo records matching the "Showing 6 of 100 results" in Figma
export const FIGMA_DEMO_WORKERS: WorkerListRow[] = (() => {
  const result: WorkerListRow[] = [...BASE_DEMO_WORKERS];
  const clientPool = ["Lennox", "Freddie Mac", "HealthTech", "Nexus Medical", "Apex Systems"];
  const rolePool = [
    "IT Project Manager",
    "Oracle Fusion ERP Admin",
    "Software Engineer",
    "Medical Assistant",
    "Production Supervisor",
    "Recruitment Coordinator",
    "Property Manager",
    "Digital Marketing Specialist",
    "Frontend Developer",
    "DevOps Engineer",
  ];
  const firstNames = ["James", "Emma", "Oliver", "Ava", "William", "Mia", "Lucas", "Charlotte", "Henry", "Amelia"];
  const lastNames = ["Brown", "Taylor", "Davies", "Evans", "Wilson", "Thomas", "Roberts", "Johnson", "Walker", "Wright"];

  for (let i = 11; i <= 100; i++) {
    const fn = firstNames[(i - 11) % firstNames.length];
    const ln = lastNames[Math.floor((i - 11) / firstNames.length) % lastNames.length];
    const role = rolePool[(i - 1) % rolePool.length];
    const client = clientPool[(i - 1) % clientPool.length];
    const exp = `${((i % 7) + 1)} yrs experience`;
    const rate = `$${30 + (i % 5) * 5}/hr`;
    const isInactive = i % 8 === 0;

    result.push({
      id: `demo-w-${i}`,
      profileId: `demo-w-${i}`,
      name: `${fn} ${ln}`,
      experience: exp,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}@example.com`,
      phone: `(${200 + (i * 7) % 700}) 555-${String(1000 + i).slice(-4)}`,
      assignmentStartDate: "05/23/2026",
      assignmentEndDate: "05/23/2026",
      jobRole: role,
      jobId: `demo-job-${(i % 10) + 1}`,
      payRate: rate,
      status: isInactive ? "Inactive" : "Active",
      client,
      manager: i % 2 === 0 ? "Sean J." : "Amanda Miller",
      facilities: [`${client} Main Facility`, `${client} Branch Office`],
      location: "Dallas, TX",
      createdAt: "2026-05-23T08:00:00Z",
      workerType: i % 2 === 0 ? "W-2" : "1099",
      employmentType: i % 2 === 0 ? "Full-time" : "Contract",
      reference: `WRK-${String(i).padStart(3, "0")}`,
    });
  }
  return result;
})();
