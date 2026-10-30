import type { UserRole } from "@/lib/roles";

/** Role is expressed through work and clothing, never inferred personal characteristics. */
export const GUIDE_ROLE_PROPS = {
  APP_OWNER: "platform-console",
  SUPER_ADMIN: "institution-blueprint",
  CAMPUS_ADMIN: "campus-map",
  ADMIN: "coordination-checklist",
  PRINCIPAL: "academic-folio",
  TEACHER: "lesson-board",
  PARENT: "family-planner",
  STUDENT: "learning-notebook",
  ACCOUNTANT: "finance-ledger",
  LIBRARIAN: "book-stack",
  RECEPTIONIST: "welcome-pass",
} satisfies Record<UserRole, string>;

/** A shared 24-unit drawing keeps the role's task consistent on the tablet and launch cue. */
export function RoleGuideSymbol({ role }: { role: UserRole }) {
  const common = { stroke: "var(--brand-700)", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <g {...common}>
    {role === "STUDENT" && <><path d="M3 5c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2zM12 7v15" /><path d="m6 10 3 1m-3 3 3 1m6-4 3-1m-3 5 3-1" /></>}
    {role === "PARENT" && <><path d="M3 6h18v15H3zM3 10h18M7 3v5m10-5v5" /><path d="M8 14c-2-2-4 1-2 3l3 3 3-3c2-2 0-5-2-3z" fill="var(--brand-200)" /><path d="m16 15 1 1 3-3" /></>}
    {role === "TEACHER" && <><path d="M3 4h18v13H3zM12 17v4m-5 1 5-1 5 1M6 8h8m-8 4h5" /><path d="m14 13 2-4 2 4m-3-1h2" /></>}
    {role === "PRINCIPAL" && <><path d="m2 8 10-5 10 5-10 5zM6 10v7c4 3 8 3 12 0v-7M22 8v8" /><path d="m9 20 3 2 3-2" /></>}
    {role === "CAMPUS_ADMIN" && <><path d="M8 21V5h8v16M3 21V11h5m8 0h5v10M1 21h22M11 8h2m-2 4h2m-2 4h2" /><path d="M11 21v-2h2v2" /></>}
    {role === "ADMIN" && <><rect x="4" y="4" width="16" height="18" rx="2" /><path d="M9 3h6v3H9zM8 11l1 1 2-3m2 2h3m-8 6 1 1 2-3m2 2h3" /></>}
    {role === "SUPER_ADMIN" && <><path d="M8 3h8v6H8zM2 16h7v6H2zM15 16h7v6h-7zM12 9v4m-7 3v-3h14v3M10 6h4M4 19h3m10 0h3" /></>}
    {role === "ACCOUNTANT" && <><rect x="4" y="2" width="16" height="21" rx="2" /><path d="M7 6h10v4H7zM7 14h1m4 0h1m4 0h0M7 18h1m4 0h1m4 0h0" /></>}
    {role === "LIBRARIAN" && <><path d="M3 3h5v18H3zM10 7h5v14h-5zM15 5l5-1 3 16-5 1zM3 7h5m2 4h5m-12 6h5m10-8 4-1" /></>}
    {role === "RECEPTIONIST" && <><path d="M4 13V10a8 8 0 0 1 16 0v3M4 12H2v6h4v-6zM20 12h2v6h-4v-6zM20 18v2h-6" /><rect x="10" y="19" width="5" height="3" rx="1.5" /></>}
    {role === "APP_OWNER" && <><rect x="2" y="3" width="20" height="15" rx="2" /><path d="m5 11 3 0 2-4 4 8 2-4h3M8 22h8m-4-4v4" /></>}
  </g>;
}

export function RoleGuideBackpack({ role }: { role: UserRole }) {
  if (role !== "STUDENT") return null;
  return <g data-guide-accessory="backpack">
    <path d="M100 167c-25-5-35 10-34 34l4 47c9 11 25 12 37 3l7-59z" fill="var(--brand-800)" />
    <path d="M79 186c-1-21 18-27 29-13" stroke="var(--brand-300)" strokeWidth="5" />
    <rect x="70" y="212" width="26" height="30" rx="7" fill="var(--brand-400)" />
    <path d="M73 219h19m-4 0v6" stroke="var(--brand-100)" strokeWidth="2" />
  </g>;
}

export function RoleGuideOutfit({ role }: { role: UserRole }) {
  switch (role) {
    case "STUDENT":
      return <g data-guide-outfit="learning-hoodie">
        <path d="M128 158c-19 6-27 22-27 46l8 63c23 12 67 13 96-2l4-61c0-27-13-40-33-46z" fill="var(--brand-400)" />
        <path d="m132 157 26 20 22-20 9 11-31 24-34-23z" fill="var(--brand-200)" />
        <path d="M145 184v25m24-25v25" stroke="var(--brand-50)" strokeWidth="3" strokeLinecap="round" />
        <path d="m129 231-6 18h65l-6-18z" fill="var(--brand-500)" stroke="var(--brand-300)" strokeWidth="2" />
        <path d="M114 264h85M114 174l10 48" stroke="var(--brand-800)" strokeWidth="6" />
        <circle cx="179" cy="211" r="8" fill="var(--brand-100)" />
        <path d="m175 211 3 3 5-6" stroke="var(--brand-600)" strokeWidth="2" />
      </g>;
    case "PARENT":
      return <g data-guide-outfit="everyday-cardigan">
        <path d="m134 157 24 12 23-12 7 105h-57z" fill="var(--brand-50)" />
        <path d="m128 157 14 10-7 103-26-6-7-61c-1-23 9-40 26-46m50 0-11 11 13 103 25-6 4-63c0-24-10-39-31-45" fill="var(--brand-500)" />
        <path d="m135 174-7 90m50-90 9 90" stroke="var(--brand-200)" strokeWidth="3" />
        <path d="M110 231h20v22h-18m72-22h18l-2 22h-14" stroke="var(--brand-300)" strokeWidth="2" />
        <path d="M144 195h28m-27 12h28m-27 12h28" stroke="var(--brand-200)" strokeWidth="3" />
      </g>;
    case "TEACHER":
      return <g data-guide-outfit="teaching-overshirt">
        <path d="m136 157 22 18 21-18-5 108h-36z" fill="var(--brand-50)" />
        <path d="m134 158-10 20 20 11 14-14 14 14 19-12-12-20-21 18z" fill="var(--brand-200)" />
        <path d="M157 190v77" stroke="var(--brand-300)" strokeWidth="3" />
        <path d="M176 199h22v23h-22z" fill="var(--brand-400)" stroke="var(--brand-200)" strokeWidth="2" />
        <path d="M181 192v14m7-17v17m6-11v11" stroke="var(--brand-50)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="158" cy="207" r="2" fill="var(--brand-700)" /><circle cx="158" cy="226" r="2" fill="var(--brand-700)" />
      </g>;
    case "PRINCIPAL":
      return <g data-guide-outfit="academic-blazer">
        <path d="m136 155 22 50 22-50" fill="var(--brand-50)" />
        <path d="m134 158-12 22 20 8-8 12 24 27 20-30-8-11 21-7-10-22-23 48z" fill="var(--brand-300)" />
        <path d="m157 175-5 10 6 20 7-20-6-10" fill="var(--brand-900)" />
        <path d="m179 210 17-2-1 14-7 7-9-5z" fill="var(--brand-100)" />
        <path d="m182 215 6-3 6 3-6 3z" fill="var(--brand-600)" />
        <path d="M159 227v37" stroke="var(--brand-300)" strokeWidth="2" /><circle cx="166" cy="238" r="3" fill="var(--brand-100)" />
      </g>;
    case "CAMPUS_ADMIN":
      return <g data-guide-outfit="operations-gilet">
        <path d="m135 157 23 20 23-20 9 107h-59z" fill="var(--brand-50)" />
        <path d="m128 158 15 11 1 103-35-8-7-62c0-21 10-37 26-44m53 0-15 11 5 103 34-7 4-63c0-23-11-38-28-44" fill="var(--brand-800)" />
        <path d="M158 176v91" stroke="var(--brand-400)" strokeWidth="3" />
        <path d="M110 218h28v25h-27zm65 0h28v25h-26zM112 221h24m42 0h22" fill="var(--brand-600)" stroke="var(--brand-300)" strokeWidth="2" />
        <rect x="175" y="188" width="22" height="13" rx="3" fill="var(--brand-200)" />
        <path d="M180 192h12m-12 5h8" stroke="var(--brand-700)" strokeWidth="2" />
      </g>;
    case "ADMIN":
      return <g data-guide-outfit="coordination-shirt">
        <path d="m134 158 24 15 22-15 10 108h-60z" fill="var(--brand-200)" />
        <path d="m135 157-8 18 17 11 14-13 14 13 16-12-8-17-22 16z" fill="var(--brand-50)" />
        <path d="M156 190v76m-14-92 13 43 23-43" stroke="var(--brand-700)" strokeWidth="3" />
        <rect x="144" y="215" width="27" height="32" rx="4" fill="var(--brand-50)" />
        <circle cx="157" cy="224" r="5" fill="var(--brand-400)" /><path d="M149 235h16m-13 6h10" stroke="var(--brand-300)" strokeWidth="2" />
      </g>;
    case "SUPER_ADMIN":
      return <g data-guide-outfit="institution-coat">
        <path d="m136 156 22 37 21-37-4 103h-33z" fill="var(--brand-50)" />
        <path d="m130 158-10 23 18 8-12 12 43 64 30 1-18-109-23 36-28-35" fill="var(--brand-800)" />
        <path d="m132 161 25 33-19 13m39-45-19 32 24 14" stroke="var(--brand-300)" strokeWidth="3" />
        <circle cx="155" cy="221" r="3" fill="var(--brand-200)" /><circle cx="177" cy="221" r="3" fill="var(--brand-200)" />
        <circle cx="163" cy="243" r="3" fill="var(--brand-200)" /><circle cx="185" cy="243" r="3" fill="var(--brand-200)" />
        <path d="m181 181 5-3 5 3-2 6h-6z" fill="var(--brand-200)" />
      </g>;
    case "ACCOUNTANT":
      return <g data-guide-outfit="finance-waistcoat">
        <path d="m134 156 24 18 21-18 18 107h-78z" fill="var(--brand-50)" />
        <path d="m128 159 15 11 15 35 16-35 12-11 12 100-24 11-16-13-17 13-25-12z" fill="var(--brand-800)" />
        <path d="M158 205v52m-35-24h22m26 0h21" stroke="var(--brand-300)" strokeWidth="2" />
        <circle cx="158" cy="216" r="2.5" fill="var(--brand-100)" /><circle cx="158" cy="232" r="2.5" fill="var(--brand-100)" /><circle cx="158" cy="248" r="2.5" fill="var(--brand-100)" />
        <path d="m157 177-5 9 6 17 6-17-5-9" fill="var(--brand-500)" />
      </g>;
    case "LIBRARIAN":
      return <g data-guide-outfit="library-apron">
        <path d="m134 157 24 19 22-19-3 108h-40z" fill="var(--brand-50)" />
        <path d="M130 168v32m52-32v32" stroke="var(--brand-300)" strokeWidth="8" />
        <path d="M124 191h64l13 76c-28 10-61 10-88 0z" fill="var(--brand-300)" />
        <path d="M132 224h48v27h-48z" fill="var(--brand-400)" stroke="var(--brand-200)" strokeWidth="2" />
        <path d="M155 225v25" stroke="var(--brand-200)" strokeWidth="2" />
        <path d="m140 204 13 2 13-2v12l-13 2-13-2zM153 206v12" stroke="var(--brand-700)" strokeWidth="2" />
      </g>;
    case "RECEPTIONIST":
      return <g data-guide-outfit="welcome-jacket">
        <path d="m135 158 23 19 22-19-5 107h-35z" fill="var(--brand-50)" />
        <path d="m130 158 28 20 25-20 9 16-34 20-36-20z" fill="var(--brand-300)" />
        <path d="M158 194v73" stroke="var(--brand-200)" strokeWidth="3" />
        <rect x="174" y="204" width="28" height="15" rx="3" fill="var(--brand-50)" />
        <circle cx="180" cy="211" r="3" fill="var(--brand-400)" /><path d="M186 209h11m-11 5h8" stroke="var(--brand-400)" strokeWidth="2" />
        <path d="m114 245 28 2m32 0 25-3" stroke="var(--brand-300)" strokeWidth="3" />
      </g>;
    case "APP_OWNER":
      return <g data-guide-outfit="platform-jacket">
        <path d="m132 158 26 14 24-14 8 13-30 17-35-17z" fill="var(--brand-950)" />
        <path d="M157 185v82" stroke="var(--brand-100)" strokeWidth="3" />
        <path d="m112 229 28 10m34 0 26-10" stroke="var(--brand-300)" strokeWidth="3" />
        <path d="M174 199h27v19h-27z" fill="var(--brand-950)" />
        <path d="m177 209 5 0 3-6 5 11 3-5h5" stroke="var(--brand-200)" strokeWidth="2" />
        <path d="M111 263h89" stroke="var(--brand-950)" strokeWidth="5" />
      </g>;
  }
}

/** Props stay mounted in every pose so the persona survives chapter changes. */
export function RoleGuideProp({ role }: { role: UserRole }) {
  return <g data-guide-prop={GUIDE_ROLE_PROPS[role]} transform="rotate(-8 90 260)">
    {role === "STUDENT" && <>
      <rect x="66" y="233" width="43" height="55" rx="5" fill="var(--brand-100)" stroke="var(--brand-600)" strokeWidth="2" />
      <path d="M75 234v53m-13-44h8m-8 10h8m-8 10h8m-8 10h8" stroke="var(--brand-800)" strokeWidth="3" strokeLinecap="round" />
      <path d="m84 248 9-5 9 5-9 5zM85 257h16m-16 7h12" stroke="var(--brand-500)" strokeWidth="2" />
    </>}
    {role === "PARENT" && <>
      <rect x="54" y="237" width="58" height="49" rx="6" fill="var(--brand-50)" stroke="var(--brand-700)" strokeWidth="2" />
      <path d="M55 249h56" stroke="var(--brand-400)" strokeWidth="8" /><path d="M66 233v11m34-11v11" stroke="var(--brand-800)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="69" cy="260" r="4" fill="var(--brand-500)" /><circle cx="82" cy="262" r="3" fill="var(--brand-300)" />
      <path d="M62 273c0-11 14-11 14 0m0 0c0-9 12-9 12 0" stroke="var(--brand-500)" strokeWidth="3" />
      <path d="m95 261 4 4 7-8m-12 17h11" stroke="var(--brand-600)" strokeWidth="2" />
    </>}
    {role === "TEACHER" && <>
      <rect x="50" y="234" width="62" height="47" rx="5" fill="var(--brand-900)" stroke="var(--brand-300)" strokeWidth="4" />
      <path d="M60 247h26m-26 8h19m-19 8h24" stroke="var(--brand-100)" strokeWidth="3" strokeLinecap="round" />
      <path d="m90 264 6-17 7 17m-11-6h9" stroke="var(--brand-200)" strokeWidth="2" />
      <path d="M58 282h48" stroke="var(--brand-600)" strokeWidth="5" strokeLinecap="round" />
    </>}
    {role === "PRINCIPAL" && <>
      <path d="M63 237h43v54H63z" fill="var(--brand-950)" stroke="var(--brand-300)" strokeWidth="2" />
      <path d="M70 238v52" stroke="var(--brand-500)" strokeWidth="2" />
      <path d="m76 252 13-6 13 6-13 6zM81 255v9c6 3 11 3 16 0v-9" stroke="var(--brand-200)" strokeWidth="2" />
      <path d="M79 277h19" stroke="var(--brand-300)" strokeWidth="2" />
    </>}
    {role === "CAMPUS_ADMIN" && <>
      <path d="m52 243 20-5 20 5 20-5v45l-20 5-20-5-20 5z" fill="var(--brand-100)" stroke="var(--brand-600)" strokeWidth="2" />
      <path d="M72 239v43m20-38v43M57 260h24v17h14" stroke="var(--brand-300)" strokeWidth="2" />
      <path d="M89 253c0-9 14-9 14 0 0 5-7 11-7 11s-7-6-7-11z" fill="var(--brand-700)" />
      <circle cx="96" cy="252" r="2.5" fill="var(--brand-100)" /><path d="M58 247h8v7h-8zm21 6h6v8h-6z" fill="var(--brand-400)" />
    </>}
    {role === "ADMIN" && <>
      <rect x="65" y="234" width="44" height="56" rx="5" fill="var(--brand-200)" stroke="var(--brand-700)" strokeWidth="2" />
      <rect x="77" y="230" width="20" height="10" rx="3" fill="var(--brand-700)" />
      <path d="m73 250 3 3 5-6m-8 16 3 3 5-6m-8 16 3 3 5-6M86 250h15m-15 13h15m-15 13h11" stroke="var(--brand-700)" strokeWidth="2" strokeLinecap="round" />
    </>}
    {role === "SUPER_ADMIN" && <>
      <path d="M48 242h62v42H48z" fill="var(--brand-700)" stroke="var(--brand-200)" strokeWidth="2" />
      <path d="M48 242c-10-4-10 8 0 8v35c-10-3-10-12 0-9" fill="var(--brand-300)" />
      <path d="M60 273v-15h15v15m8 0v-21h16v21M56 274h47M63 262h4m-4 5h4m20-10h7m-7 6h7m-7 5h7" stroke="var(--brand-100)" strokeWidth="2" />
    </>}
    {role === "ACCOUNTANT" && <>
      <rect x="54" y="237" width="43" height="51" rx="4" fill="var(--brand-100)" stroke="var(--brand-700)" strokeWidth="2" />
      <path d="M62 247h26m-26 9h26m-26 9h26m-26 9h26m-12-28v29" stroke="var(--brand-400)" strokeWidth="2" />
      <rect x="85" y="253" width="27" height="37" rx="4" fill="var(--brand-800)" stroke="var(--brand-300)" strokeWidth="2" />
      <rect x="90" y="258" width="17" height="7" rx="1" fill="var(--brand-100)" />
      <path d="M91 273h2m5 0h2m5 0h0m-14 7h2m5 0h2m5 0h0" stroke="var(--brand-200)" strokeWidth="3" strokeLinecap="round" />
    </>}
    {role === "LIBRARIAN" && <>
      <path d="M52 239h56v14H52c-8 0-8-14 0-14" fill="var(--brand-700)" /><path d="M55 243h49v6H55" fill="var(--brand-50)" />
      <path d="M58 256h56v14H58c-8 0-8-14 0-14" fill="var(--brand-300)" /><path d="M61 260h49v6H61" fill="var(--brand-50)" />
      <path d="M50 273h59v14H50c-8 0-8-14 0-14" fill="var(--brand-900)" /><path d="M53 277h52v6H53" fill="var(--brand-50)" />
      <path d="m89 242 8 0v14l-4-3-4 3z" fill="var(--brand-400)" />
    </>}
    {role === "RECEPTIONIST" && <>
      <path d="M76 236v-10c0-8 20-8 20 0v10" stroke="var(--brand-500)" strokeWidth="3" />
      <rect x="59" y="236" width="54" height="49" rx="6" fill="var(--brand-100)" stroke="var(--brand-700)" strokeWidth="2" />
      <rect x="75" y="240" width="22" height="4" rx="2" fill="var(--brand-700)" />
      <circle cx="74" cy="256" r="5" fill="var(--brand-400)" /><path d="M66 271c0-12 16-12 16 0" fill="var(--brand-400)" />
      <path d="M88 254h16m-16 7h11m-11 13 5-4 5 4" stroke="var(--brand-600)" strokeWidth="2" />
    </>}
    {role === "APP_OWNER" && <>
      <rect x="49" y="239" width="63" height="42" rx="5" fill="var(--brand-950)" stroke="var(--brand-300)" strokeWidth="2" />
      <path d="m55 264 10 0 5-14 10 24 5-13h20" stroke="var(--brand-300)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M55 247h4m4 0h4m4 0h4" stroke="var(--brand-100)" strokeWidth="2" />
      <path d="M44 284h72l-6 7H50z" fill="var(--brand-500)" />
    </>}
  </g>;
}

export function RoleGuideHeadset({ role }: { role: UserRole }) {
  if (role !== "RECEPTIONIST") return null;
  return <g data-guide-accessory="welcome-headset">
    <path d="M119 106V89c0-48 79-48 79 0v17" stroke="var(--brand-500)" strokeWidth="6" />
    <rect x="112" y="98" width="12" height="25" rx="6" fill="var(--brand-800)" stroke="var(--brand-200)" strokeWidth="2" />
    <rect x="192" y="98" width="12" height="25" rx="6" fill="var(--brand-800)" stroke="var(--brand-200)" strokeWidth="2" />
    <path d="M198 120c0 13-8 18-18 18" stroke="var(--brand-500)" strokeWidth="3" />
    <rect x="171" y="135" width="12" height="6" rx="3" fill="var(--brand-800)" />
  </g>;
}
