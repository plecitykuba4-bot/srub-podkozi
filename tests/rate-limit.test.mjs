import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loginAllowed,recordFailedLogin,clearLoginFailures} from '../lib/login-rate-limit.mjs';
test('Převzatá ochrana přihlášení zastaví další pokusy po pěti selháních',()=>{
 const key='test:'+Date.now();for(let i=0;i<5;i++)recordFailedLogin([key]);
 assert.equal(loginAllowed([key]),false);clearLoginFailures([key]);assert.equal(loginAllowed([key]),true);
});
