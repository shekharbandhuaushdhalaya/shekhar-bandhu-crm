import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, RefreshControl, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../utils/themeContext';
import { getApiBaseUrl } from '../utils/api';
import { authStorage } from '../utils/storage';
import { Spacing, Radius } from '../constants/theme';

type Tab = 'dashboard'|'orders'|'schemes'|'returns'|'commissions';

async function request(path:string, init:RequestInit={}) {
  const token = await authStorage.getItem('vp_crm_token');
  const res = await fetch(`${getApiBaseUrl()}${path}`, { ...init, headers:{ 'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{ }), ...(init.headers||{}) } });
  const body = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}

export default function SalesWorkspace(){
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const [tab,setTab]=useState<Tab>('dashboard');
  const [refreshing,setRefreshing]=useState(false);
  const [dashboard,setDashboard]=useState<any>(null);
  const [orders,setOrders]=useState<any[]>([]);
  const [schemes,setSchemes]=useState<any[]>([]);
  const [returns,setReturns]=useState<any[]>([]);
  const [commissions,setCommissions]=useState<any>(null);
  const [search,setSearch]=useState('');
  const [searchResults,setSearchResults]=useState<any>(null);
  const [schemeName,setSchemeName]=useState(''); const [schemeCode,setSchemeCode]=useState(''); const [schemeProductId,setSchemeProductId]=useState(''); const [schemeMin,setSchemeMin]=useState('10'); const [schemeFree,setSchemeFree]=useState('1'); const [schemeDiscount,setSchemeDiscount]=useState('0');
  const [showQuickSale,setShowQuickSale]=useState(false);
  const [customers,setCustomers]=useState<any[]>([]); const [products,setProducts]=useState<any[]>([]); const [warehouses,setWarehouses]=useState<any[]>([]);
  const [qsCustomer,setQsCustomer]=useState(''); const [qsProduct,setQsProduct]=useState(''); const [qsWarehouse,setQsWarehouse]=useState(''); const [qsQty,setQsQty]=useState('1'); const [qsBatch,setQsBatch]=useState('');

  const load=useCallback(async()=>{
    const [d,o,s,r,c,cu,pr,wh]=await Promise.all([
      request('/sales-workflow/dashboard').catch(()=>null),
      request('/orders?page=1&limit=100').catch(()=>({data:[]})),
      request('/sales-workflow/schemes').catch(()=>[]),
      request('/sales-workflow/returns').catch(()=>[]),
      request('/sales-workflow/commissions').catch(()=>null),
      request('/customers?page=1&limit=300').catch(()=>[]),
      request('/products?page=1&limit=500').catch(()=>[]),
      request('/warehouses').catch(()=>[]),
    ]);
    setDashboard(d); setOrders(Array.isArray(o)?o:(o.data||[])); setSchemes(s); setReturns(r); setCommissions(c);
    setCustomers(Array.isArray(cu)?cu:(cu.data||cu.customers||[])); setProducts(Array.isArray(pr)?pr:(pr.data||pr.products||[])); setWarehouses(Array.isArray(wh)?wh:(wh.data||wh.warehouses||[]));
  },[]);
  useEffect(()=>{load();},[load]);
  const refresh=async()=>{setRefreshing(true);await load();setRefreshing(false)};

  const doSearch=async()=>{ if(!search.trim()){setSearchResults(null);return;} try{setSearchResults(await request(`/sales-workflow/search?q=${encodeURIComponent(search.trim())}`));}catch(e:any){Alert.alert('Search',e.message);} };
  const approve=async(id:string)=>{await request(`/orders/${id}/approve`,{method:'PATCH'});await load();};
  const createScheme=async()=>{try{await request('/sales-workflow/schemes',{method:'POST',body:JSON.stringify({name:schemeName,code:schemeCode,productId:schemeProductId,minQty:Number(schemeMin),freeQty:Number(schemeFree),discountPercent:Number(schemeDiscount),active:true})}); setSchemeName('');setSchemeCode('');setSchemeProductId('');await load();}catch(e:any){Alert.alert('Scheme',e.message)}};
  const createQuickSale=async()=>{try{if(!qsCustomer||!qsProduct||!qsWarehouse)return Alert.alert('Quick Sale','Select customer, product and warehouse.'); const out=await request('/sales-workflow/quick-sale',{method:'POST',body:JSON.stringify({customerId:qsCustomer,warehouseId:qsWarehouse,items:[{productId:qsProduct,qty:Number(qsQty||1),packing:1,batchNo:qsBatch||''}]})}); setShowQuickSale(false); setQsProduct(''); setQsQty('1'); setQsBatch(''); await load(); Alert.alert('Quick Sale',`Draft Challan ${out.challan?.challanNo||''} created. Finalize the Challan to move stock.`);}catch(e:any){Alert.alert('Quick Sale',e.message)}};
  const prepareRemainingChallan=async(o:any)=>{try{const items=(o.items||[]).map((i:any)=>({productId:i.productId,qty:Math.max(0,Number(i.qty||0)+Number(i.freeQty||0)-Number(i.fulfilledQty||0)),packing:1})).filter((i:any)=>i.qty>0); if(!items.length)return Alert.alert('Fulfillment','This order is already fully fulfilled.'); const out=await request(`/sales-workflow/orders/${o._id}/fulfill`,{method:'POST',body:JSON.stringify({warehouseId:o.warehouseId||qsWarehouse,items})}); await load(); Alert.alert('Challan prepared',`${out.challan.challanNo} is a draft. Review and finalize it to move stock.`);}catch(e:any){Alert.alert('Fulfillment',e.message)}};

  const tabs:[Tab,string,keyof typeof Ionicons.glyphMap][]=[['dashboard','Overview','speedometer-outline'],['orders','Orders','cart-outline'],['schemes','Schemes','pricetags-outline'],['returns','Returns','return-down-back-outline'],['commissions','Commissions','cash-outline']];
  const k=dashboard?.kpis||{};

  return <View style={styles.screen}>
    <View style={styles.header}>
      <View><Text style={styles.title}>Sales Workspace</Text><Text style={styles.subtitle}>Orders → Challans → Invoices → Collections, with flexible pricing and fulfillment</Text></View>
      <TouchableOpacity style={styles.primaryButton} onPress={()=>setShowQuickSale(v=>!v)}><Ionicons name="add" size={18} color="#fff"/><Text style={styles.primaryButtonText}>New sale</Text></TouchableOpacity>
    </View>
    {showQuickSale && <View style={[styles.card,{marginHorizontal:Spacing.lg,marginBottom:Spacing.sm}]}>
      <Text style={styles.cardTitle}>Quick Sale</Text><Text style={styles.help}>Creates the Sales Order and a draft Sale Challan together. Stock still moves only after Challan finalization.</Text>
      {Platform.OS==='web' ? <View style={styles.formRow}>
        <select value={qsCustomer} onChange={(e:any)=>setQsCustomer(e.target.value)} style={{padding:10,borderRadius:8,minWidth:210}}><option value="">Select customer</option>{customers.map(c=><option key={c._id} value={c._id}>{c.name||c.company}</option>)}</select>
        <select value={qsWarehouse} onChange={(e:any)=>setQsWarehouse(e.target.value)} style={{padding:10,borderRadius:8,minWidth:190}}><option value="">Select warehouse</option>{warehouses.map(w=><option key={w._id} value={w._id}>{w.name}</option>)}</select>
        <select value={qsProduct} onChange={(e:any)=>setQsProduct(e.target.value)} style={{padding:10,borderRadius:8,minWidth:230}}><option value="">Select product</option>{products.map(pr=><option key={pr._id} value={pr._id}>{pr.name}</option>)}</select>
      </View> : <><TextInput style={styles.inputWide} placeholder="Customer ID" value={qsCustomer} onChangeText={setQsCustomer}/><TextInput style={styles.inputWide} placeholder="Warehouse ID" value={qsWarehouse} onChangeText={setQsWarehouse}/><TextInput style={styles.inputWide} placeholder="Product ID" value={qsProduct} onChangeText={setQsProduct}/></>}
      <View style={styles.formRow}><TextInput style={styles.input} placeholder="Quantity" keyboardType="numeric" value={qsQty} onChangeText={setQsQty}/><TextInput style={styles.input} placeholder="Batch (optional; blank = FEFO)" value={qsBatch} onChangeText={setQsBatch}/><TouchableOpacity style={styles.primaryButton} onPress={createQuickSale}><Text style={styles.primaryButtonText}>Prepare sale</Text></TouchableOpacity></View>
    </View>}
    <View style={styles.searchBar}><Ionicons name="search" size={18} color={colors.text.muted}/><TextInput value={search} onChangeText={setSearch} onSubmitEditing={doSearch} placeholder="Search customer, order, challan, invoice or product" placeholderTextColor={colors.text.muted} style={styles.searchInput}/><TouchableOpacity onPress={doSearch}><Text style={styles.searchAction}>Search</Text></TouchableOpacity></View>
    {searchResults && <ScrollView horizontal style={{maxHeight:86}} contentContainerStyle={{gap:8,paddingHorizontal:Spacing.lg}}>{Object.entries(searchResults).flatMap(([type,rows]:any)=>rows.map((x:any)=><View key={`${type}-${x._id}`} style={styles.searchChip}><Text style={styles.searchChipType}>{String(type).toUpperCase()}</Text><Text style={styles.searchChipText}>{x.orderNo||x.challanNo||x.invoiceNo||x.name||x.customerName||x.partyName}</Text></View>))}</ScrollView>}
    <View style={styles.tabs}>{tabs.map(([id,label,icon])=><TouchableOpacity key={id} style={[styles.tab,tab===id&&styles.tabActive]} onPress={()=>setTab(id)}><Ionicons name={icon} size={17} color={tab===id?'#fff':colors.text.secondary}/><Text style={[styles.tabText,tab===id&&styles.tabTextActive]}>{label}</Text></TouchableOpacity>)}</View>
    <ScrollView style={{flex:1}} contentContainerStyle={{padding:Spacing.lg,paddingBottom:60}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>}>
      {tab==='dashboard' && <>
        <View style={styles.kpis}>{[['Sales',k.sales,'₹'],['Orders',k.orders,''],['Invoices',k.invoices,''],['Collections',k.collections,'₹'],['Approvals',k.pendingApprovals,''],['Partial',k.partiallyFulfilled,'']].map(([label,val,prefix]:any)=><View style={styles.kpi} key={label}><Text style={styles.kpiLabel}>{label}</Text><Text style={styles.kpiValue}>{prefix}{Number(val||0).toLocaleString('en-IN')}</Text></View>)}</View>
        <View style={styles.card}><Text style={styles.cardTitle}>Sales attribution</Text>{Object.entries(dashboard?.bySource||{}).map(([name,val]:any)=><View style={styles.row} key={name}><Text style={styles.rowMain}>{name}</Text><Text style={styles.money}>₹{Number(val).toLocaleString('en-IN')}</Text></View>)}</View>
        <View style={styles.card}><Text style={styles.cardTitle}>How stock moves</Text><Text style={styles.help}>Sales Orders reserve intent only. Physical stock moves only when the Sale Challan is finalized. Partial orders can have multiple Challans and remain backordered until fully fulfilled.</Text></View>
      </>}
      {tab==='orders' && <View style={styles.card}><Text style={styles.cardTitle}>Flexible order pipeline</Text>{orders.map(o=><View style={styles.orderRow} key={o._id}><View style={{flex:1}}><Text style={styles.rowMain}>{o.orderNo||`#${o._id.slice(-6)}`} · {o.name}</Text><Text style={styles.rowSub}>{o.status?.replaceAll('_',' ')} · {o.items?.length||0} items · {o.sourcePersonName||o.mrName||o.sourceType||'Direct'}</Text><Text style={styles.rowSub}>Fulfilled {o.items?.reduce((s:number,i:any)=>s+Number(i.fulfilledQty||0),0)}/{o.items?.reduce((s:number,i:any)=>s+Number(i.qty||0)+Number(i.freeQty||0),0)}</Text></View><Text style={styles.money}>₹{Number(o.totalAmount||0).toLocaleString('en-IN')}</Text>{o.approvalStatus==='pending_approval'&&<TouchableOpacity style={styles.smallButton} onPress={()=>approve(o._id)}><Text style={styles.smallButtonText}>Approve</Text></TouchableOpacity>}{o.approvalStatus!=='pending_approval'&&!['fulfilled','cancelled','delivered'].includes(o.status)&&<TouchableOpacity style={styles.smallButton} onPress={()=>prepareRemainingChallan(o)}><Text style={styles.smallButtonText}>Prepare Challan</Text></TouchableOpacity>}</View>)}</View>}
      {tab==='schemes' && <><View style={styles.card}><Text style={styles.cardTitle}>Create sales scheme</Text><Text style={styles.help}>Supports Buy X Get Y and percentage promotion rules. Product ID can be copied from Products.</Text><View style={styles.formRow}><TextInput style={styles.input} placeholder="Scheme name" placeholderTextColor={colors.text.muted} value={schemeName} onChangeText={setSchemeName}/><TextInput style={styles.input} placeholder="Code" placeholderTextColor={colors.text.muted} value={schemeCode} onChangeText={setSchemeCode}/></View><TextInput style={styles.inputWide} placeholder="Product ID" placeholderTextColor={colors.text.muted} value={schemeProductId} onChangeText={setSchemeProductId}/><View style={styles.formRow}><TextInput style={styles.input} placeholder="Buy qty" keyboardType="numeric" value={schemeMin} onChangeText={setSchemeMin}/><TextInput style={styles.input} placeholder="Free qty" keyboardType="numeric" value={schemeFree} onChangeText={setSchemeFree}/><TextInput style={styles.input} placeholder="Discount %" keyboardType="numeric" value={schemeDiscount} onChangeText={setSchemeDiscount}/></View><TouchableOpacity style={styles.primaryButton} onPress={createScheme}><Text style={styles.primaryButtonText}>Save scheme</Text></TouchableOpacity></View><View style={styles.card}><Text style={styles.cardTitle}>Active schemes</Text>{schemes.map(s=><View style={styles.row} key={s._id}><View><Text style={styles.rowMain}>{s.name} ({s.code})</Text><Text style={styles.rowSub}>Buy {s.minQty}, free {s.freeQty} · {s.discountPercent}% off</Text></View></View>)}</View></>}
      {tab==='returns' && <View style={styles.card}><Text style={styles.cardTitle}>Sales returns</Text><Text style={styles.help}>Returns are posted as a controlled incoming stock transaction and can create a credit note. Original Challan quantity is validated before posting.</Text>{returns.map(r=><View style={styles.row} key={r._id}><View><Text style={styles.rowMain}>{r.returnNo} · {r.customerName}</Text><Text style={styles.rowSub}>{r.status} · {r.resolution} · {r.items?.length||0} items</Text></View><Text style={styles.money}>₹{Number(r.totalAmount||0).toLocaleString('en-IN')}</Text></View>)}</View>}
      {tab==='commissions' && <View style={styles.card}><Text style={styles.cardTitle}>MR / salesperson commissions</Text><Text style={styles.help}>Rules support fixed percentages and slabs. Attribution follows the person who generated the sale, not merely the operator who entered it.</Text>{(commissions?.rows||[]).map((r:any)=><View style={styles.row} key={r.orderId}><View><Text style={styles.rowMain}>{r.personName||'Unassigned'} · {r.orderNo}</Text><Text style={styles.rowSub}>₹{Number(r.netSales||0).toLocaleString('en-IN')} × {r.rate}%</Text></View><Text style={styles.money}>₹{Number(r.commission||0).toLocaleString('en-IN')}</Text></View>)}<View style={styles.totalRow}><Text style={styles.cardTitle}>Total</Text><Text style={styles.kpiValue}>₹{Number(commissions?.total||0).toLocaleString('en-IN')}</Text></View></View>}
    </ScrollView>
  </View>
}

const createStyles=(colors:any)=>StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg.primary}, header:{paddingHorizontal:Spacing.lg,paddingTop:Spacing.lg,paddingBottom:Spacing.md,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12}, title:{fontSize:24,fontWeight:'800',color:colors.text.primary}, subtitle:{fontSize:12,color:colors.text.secondary,marginTop:3}, primaryButton:{backgroundColor:colors.primary,paddingHorizontal:16,paddingVertical:10,borderRadius:Radius.md,flexDirection:'row',gap:7,alignItems:'center',alignSelf:'flex-start'}, primaryButtonText:{color:'#fff',fontWeight:'800',fontSize:13}, searchBar:{marginHorizontal:Spacing.lg,borderWidth:1,borderColor:colors.border,backgroundColor:colors.bg.card,borderRadius:Radius.md,minHeight:46,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:10}, searchInput:{flex:1,color:colors.text.primary}, searchAction:{color:colors.primary,fontWeight:'800'}, searchChip:{backgroundColor:colors.bg.card,borderWidth:1,borderColor:colors.border,borderRadius:Radius.md,padding:9,minWidth:145}, searchChipType:{fontSize:9,fontWeight:'800',color:colors.primary}, searchChipText:{fontSize:12,fontWeight:'700',color:colors.text.primary,marginTop:2}, tabs:{flexDirection:'row',gap:7,paddingHorizontal:Spacing.lg,paddingTop:Spacing.md,flexWrap:'wrap'}, tab:{flexDirection:'row',gap:6,alignItems:'center',paddingHorizontal:12,paddingVertical:8,borderRadius:Radius.md,backgroundColor:colors.bg.card,borderWidth:1,borderColor:colors.border}, tabActive:{backgroundColor:colors.primary,borderColor:colors.primary}, tabText:{fontSize:12,fontWeight:'700',color:colors.text.secondary}, tabTextActive:{color:'#fff'}, kpis:{flexDirection:'row',gap:10,flexWrap:'wrap',marginBottom:12}, kpi:{backgroundColor:colors.bg.card,borderWidth:1,borderColor:colors.border,borderRadius:Radius.lg,padding:15,minWidth:140,flexGrow:1}, kpiLabel:{fontSize:11,fontWeight:'700',color:colors.text.muted}, kpiValue:{fontSize:22,fontWeight:'800',color:colors.text.primary,marginTop:5}, card:{backgroundColor:colors.bg.card,borderWidth:1,borderColor:colors.border,borderRadius:Radius.lg,padding:16,marginBottom:12}, cardTitle:{fontSize:15,fontWeight:'800',color:colors.text.primary,marginBottom:10}, help:{fontSize:12,lineHeight:18,color:colors.text.secondary,marginBottom:12}, row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10,paddingVertical:11,borderBottomWidth:1,borderBottomColor:colors.border}, orderRow:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:12,borderBottomWidth:1,borderBottomColor:colors.border}, rowMain:{fontSize:13,fontWeight:'700',color:colors.text.primary}, rowSub:{fontSize:11,color:colors.text.muted,marginTop:3}, money:{fontSize:13,fontWeight:'800',color:colors.text.primary}, smallButton:{backgroundColor:colors.primary,paddingHorizontal:10,paddingVertical:7,borderRadius:7}, smallButtonText:{color:'#fff',fontSize:11,fontWeight:'800'}, formRow:{flexDirection:'row',gap:8,flexWrap:'wrap',marginBottom:8}, input:{minWidth:140,flex:1,borderWidth:1,borderColor:colors.border,borderRadius:8,padding:10,color:colors.text.primary,backgroundColor:colors.bg.secondary}, inputWide:{borderWidth:1,borderColor:colors.border,borderRadius:8,padding:10,color:colors.text.primary,backgroundColor:colors.bg.secondary,marginBottom:8}, totalRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingTop:14}
});
