import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertSchedule} from '../backend/schedule.mjs';
const settings={openDays:[2],morningStart:'06:00',morningEnd:'11:00',afternoonStart:'14:00',afternoonEnd:'22:00',slotInterval:60,closures:[]};
test('shared schedule enforces weekdays, closures and original last-start semantics',()=>{
 assert.doesNotThrow(()=>assertSchedule(settings,'2026-11-03','22:00'));
 assert.throws(()=>assertSchedule(settings,'2026-11-04','10:00'),e=>e.code==='shop-closed');
 assert.throws(()=>assertSchedule(settings,'2026-11-03','12:00'),e=>e.code==='outside-schedule');
 assert.throws(()=>assertSchedule({...settings,closures:[{start:'2026-11-03',end:'2026-11-03'}]},'2026-11-03','10:00'),e=>e.code==='shop-closed');
});
