import { app } from './app.js';
import { env } from './env.js';

app.listen(env.port, () => {
  console.log(`subcurrent-backend listening on :${env.port}`);
});
