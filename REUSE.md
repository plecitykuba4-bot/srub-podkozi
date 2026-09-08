# Co využíváme z fitness aplikace

- `lib/login-rate-limit.ts` je přímo převzatý z `fitness-app/src/server/auth/login-rate-limit.ts`; odebraný pouze Next.js marker `server-only`. Chrání endpoint před ověřováním hesel, používá omezení podle účtu i adresy a promazávání pokusů.
- `scripts/backup.mjs` přizpůsobuje `fitness-app/scripts/backup-postgres.mjs` pro Node SQLite: online konzistentní záloha, časový název, 14denní retence a kontrola integrity nové zálohy.
- Integrační testy přebírají scénář izolace z `fitness-app/tests/isolation.test.ts`: dva různí klienti, podvržené ID a test proti skutečné databázi. Tady testujeme přímo HTTP API.
- Session a pozastavení firmy používají stejný princip jako `fitness-app/src/server/auth/session.ts`: serverová session, HttpOnly cookie, expirace a okamžité odmítnutí archivovaného klienta i s dříve platnou session.
- Český locale je explicitní ve všech formátovačích, stejně jako v `fitness-app/src/lib/format.ts`; uzávěrka navíc explicitně používá Europe/Prague.
- Demo má samostatné údaje a databázi, citlivé nastavení je v prostředí, mobilní rozhraní se ověřuje v prohlížeči.

Nekopírujeme databázi, přístupy ani fitness obrazovky. Restaurant projekt používá jednoduchý samostatný Node server místo Next.js/Prisma, takže přenesené moduly se obejdou bez závislosti na původní aplikaci.
