import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){return next(['./wallet-analytics','./estimator','./txflow-estimator','./pair-rewards','./variational-estimator'].includes(specifier)?specifier+'.ts':specifier,context);}});
const {pairRewardDefaults,parsePairRewardInputs,pairRewardLeg,pairRewardScenario,pairBreakEvenFdv} = await import('../lib/pair-rewards.ts');

const projects=['arcus','txflow'];
const a={points:'100',pool:'1000',allocation:'10',fdv:'10000'};
const b={points:'50',pool:'1000',allocation:'20',fdv:'10000'};

test('independent FDVs value each project separately and add rewards to existing net PnL once',()=>{
  const baseline=pairRewardScenario(projects,[a,b],'-200');
  assert.equal(baseline.rewardValue,'200');
  assert.equal(baseline.netResult,'0');
  assert.equal(baseline.status,'break-even');
  assert.equal(baseline.lossToCover,'200');
  assert.equal(baseline.coveragePercent,'100');
  const higherA=pairRewardScenario(projects,[{...a,fdv:'20000'},b],'-200');
  assert.equal(higherA.legs[0].value,'200');
  assert.equal(higherA.legs[1].value,'100');
  assert.equal(higherA.netResult,'100');
  assert.equal(higherA.coveragePercent,'150');
  assert.equal(higherA.status,'above');
  assert.equal(pairRewardScenario(projects,[{...a,fdv:'5000'},b],'-200').status,'below');
});

test('blank and unsupported rewards are explicitly excluded; malformed included rewards remain unknown',()=>{
  const blank={...b,points:''};
  const one=pairRewardScenario(projects,[a,blank],'-200');
  assert.equal(one.legs[1].included,false);
  assert.equal(one.rewardValue,'100');
  assert.equal(one.netResult,'-100');
  assert.equal(one.coveragePercent,'50');
  assert.equal(pairRewardScenario(['arcus','entropy'],[a,b],'-200').netResult,'-100');
  const empty=pairRewardScenario(projects,[{...a,points:''},blank],'-200');
  assert.equal(empty.rewardValue,null);
  assert.equal(empty.netResult,null);
  for(const patch of [{points:'1001'},{points:'-1'},{points:'1e3'},{points:'NaN'},{pool:'0'},{allocation:'101'},{allocation:'0'},{fdv:'0'},{fdv:'1000000000000001'}]){
    const invalid=pairRewardScenario(projects,[{...a,...patch},b],'-200');
    assert.ok(invalid.error);
    assert.equal(invalid.rewardValue,null);
    assert.equal(invalid.netResult,null);
    assert.equal(invalid.status,'unknown');
  }
});

test('no base PnL gives point estimates but no profitability claim; explicit zero points and zero PnL remain valid',()=>{
  const unknown=pairRewardScenario(projects,[a,b],null);
  assert.equal(unknown.rewardValue,'200');
  assert.equal(unknown.netResult,null);
  assert.equal(unknown.status,'unknown');
  assert.equal(pairBreakEvenFdv(projects,[a,b],null,0),null);
  const noPoints=pairRewardScenario(projects,[{...a,points:'0'},{...b,points:'0'}],'0');
  assert.equal(noPoints.rewardValue,'0');
  assert.equal(noPoints.netResult,'0');
  assert.equal(noPoints.status,'break-even');
  const profitable=pairRewardScenario(projects,[a,b],'20');
  assert.equal(profitable.netResult,'220');
  assert.equal(profitable.lossToCover,'0');
  assert.equal(profitable.coveragePercent,null);
});

test('break-even FDV holds the other reward fixed and rounds the required threshold upwards',()=>{
  assert.equal(pairBreakEvenFdv(projects,[a,b],'-200',0),'10000');
  assert.equal(pairBreakEvenFdv(projects,[a,{...b,fdv:'5000'}],'-200',0),'15000');
  assert.equal(pairBreakEvenFdv(projects,[a,b],'-50',0),'0');
  const fractional={points:'3',pool:'100',allocation:'30',fdv:'100'};
  const blank={...b,points:''};
  assert.equal(pairBreakEvenFdv(projects,[fractional,blank],'-1',0),'111.12');
  assert.equal(pairRewardScenario(projects,[{...fractional,fdv:'111.11'},blank],'-1').status,'below');
  assert.equal(pairRewardScenario(projects,[{...fractional,fdv:'111.12'},blank],'-1').status,'above');
  assert.equal(pairBreakEvenFdv(projects,[{...a,points:'0'},blank],'-200',0),null);
});

test('two wallets on one project share assumptions and cannot claim more points than its pool',()=>{
  const same=['arcus','arcus'], second={...a,points:'50'};
  const result=pairRewardScenario(same,[a,second],'-150');
  assert.equal(result.rewardValue,'150');
  assert.equal(result.status,'break-even');
  assert.equal(pairBreakEvenFdv(same,[a,second],'-150',0),'10000');
  assert.ok(pairRewardScenario(same,[a,{...second,fdv:'20000'}],'-150').error);
  assert.ok(pairRewardScenario(same,[{...a,points:'700'},{...second,points:'400'}],'-150').error);
  const restored=parsePairRewardInputs([a,{...b,fdv:'999'}],same);
  assert.equal(restored[1].fdv,a.fdv);
  assert.equal(restored[1].allocation,a.allocation);
  assert.equal(restored[1].points,b.points);
});

test('manual settings restore independently and start with the existing calculators assumptions',()=>{
  assert.equal(pairRewardDefaults('arcus').pool,'11000000');
  assert.equal(pairRewardDefaults('txflow').pool,'45600000');
  assert.equal(pairRewardDefaults('risex').pool,'10000000');
  assert.equal(pairRewardDefaults('entropy').pool,'');
  assert.deepEqual(parsePairRewardInputs([a,b],projects),[a,b]);
  assert.equal(parsePairRewardInputs(null,projects)[0].points,'');
  assert.equal(pairRewardLeg('entropy',a).included,false);
});

test('three rewarded projects and a fourth unmodeled project all retain their contribution to net result',()=>{
  const ids=['arcus','txflow','risex','entropy'], c={...a}, inputs=[a,b,c,pairRewardDefaults('entropy')];
  const result=pairRewardScenario(ids,inputs,'-400');
  assert.equal(result.legs.length,4);
  assert.equal(result.legs[3].included,false);
  assert.equal(result.rewardValue,'300');
  assert.equal(result.netResult,'-100');
  assert.equal(result.coveragePercent,'75');
  assert.equal(pairBreakEvenFdv(ids,inputs,'-400',2),'20000');
  assert.equal(pairBreakEvenFdv(ids,[{...a,fdv:'20000'},b,c,inputs[3]],'-400',2),'10000');
  assert.equal(pairRewardScenario(ids,[a,b,{...c,fdv:'20000'},inputs[3]],'-400').status,'break-even');
  assert.equal(pairRewardScenario(ids,inputs.slice(0,3),'-400').netResult,null);
});

test('nonadjacent wallets on a shared project use a common threshold without counting other rewards twice',()=>{
  const ids=['arcus','txflow','arcus'], shared={...a,points:'50'};
  assert.equal(pairRewardScenario(ids,[a,b,shared],'-250').netResult,'0');
  assert.equal(pairBreakEvenFdv(ids,[a,b,shared],'-250',2),'10000');
  assert.equal(pairBreakEvenFdv(ids,[a,b,shared],'-250',0),'10000');
  assert.ok(pairRewardScenario(ids,[a,b,{...shared,pool:'2000'}],'-250').error);
  const restored=parsePairRewardInputs([a,b,{...shared,fdv:'9'}],ids);
  assert.equal(restored[2].fdv,a.fdv);
  assert.equal(restored[1].allocation,b.allocation);
});

test('Variational rewards use the calculator assumptions and contribute alongside other project points',()=>{
  const defaults=pairRewardDefaults('variational');
  assert.equal(defaults.pool,'10350000');
  assert.equal(defaults.allocation,'32');
  const ids=['arcus','txflow','risex','entropy','variational'];
  const reward={...a,allocation:'32'};
  const result=pairRewardScenario(ids,[a,b,a,pairRewardDefaults('entropy'),reward],'-500');
  assert.equal(result.rewardValue,'620');
  assert.equal(result.netResult,'120');
  assert.equal(result.status,'above');
  assert.equal(pairBreakEvenFdv(ids,[a,b,a,pairRewardDefaults('entropy'),reward],'-500',4),'6250');
});
