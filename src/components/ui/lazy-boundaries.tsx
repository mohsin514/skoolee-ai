"use client";

// SKAI-1004: the root error and not-found boundaries are part of every route's
// first-load JS. Their views translate through the full EN/AR/UR UI catalog, so
// they are code-split here and fetched only when an error or 404 renders.
import dynamic from "next/dynamic";

export const LazyRouteError = dynamic(() => import("./route-error").then((m) => m.RouteError));
export const LazyNotFoundView = dynamic(() => import("./not-found-view").then((m) => m.NotFoundView));
