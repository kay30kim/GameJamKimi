"use client";

import dynamic from "next/dynamic";

/** The QA page runs its audits in the browser only; there is nothing to server-render. */
export default dynamic(() => import("./collision-qa"), { ssr: false });
