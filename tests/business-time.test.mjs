import {test} from 'node:test';
import assert from 'node:assert/strict';
import {businessTime} from '../development/business-time.mjs';
test('cash date follows the Paraguay business day across UTC midnight',()=>{
 assert.deepEqual(businessTime(new Date('2026-11-03T00:30:00Z')),{date:'2026-11-02',time:'21:30'});
 assert.deepEqual(businessTime(new Date('2026-11-03T03:00:00Z')),{date:'2026-11-03',time:'00:00'});
});
