import { z } from "zod";
const inner = z.preprocess((v)=> (v===""?undefined:v), z.string().optional());
console.log("bare pipe, key absent :", JSON.stringify(z.object({a:inner}).safeParse({})));
const outer = z.preprocess((v)=> (v===""?undefined:v), z.string().optional()).optional();
console.log("pipe.optional, absent  :", JSON.stringify(z.object({a:outer}).safeParse({})));
console.log("pipe.optional, blank   :", JSON.stringify(z.object({a:outer}).safeParse({a:""})));
console.log("pipe.optional, value   :", JSON.stringify(z.object({a:outer}).safeParse({a:" x "})));
