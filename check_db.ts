import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";

const client = new ConvexHttpClient("http://127.0.0.1:32773"); // default local convex url
// wait, I can just use npx convex run
