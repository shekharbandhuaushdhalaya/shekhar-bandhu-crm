import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { api } from '../utils/api';
import ScreenHeader from '../components/ScreenHeader';
import { useTheme } from '../utils/themeContext';

export default function ComplianceScreen(){
  const { colors } = useTheme(); const [loading,setLoading]=useState(true); const [data,setData]=useState<any>({}); const [error,setError]=useState('');
  const load=async()=>{setLoading(true);setError(''); try { const [eq,dev,st,rec,vq,spec]=await Promise.all([api.getManufacturingEquipment(),api.getManufacturingDeviations(),api.getStabilityStudies(),api.getRecalls(),api.getVendorQualifications(),api.getQualitySpecifications()]); setData({eq,dev,st,rec,vq,spec}); } catch(e:any){setError(e?.message||'Unable to load compliance modules');} finally{setLoading(false);} };
  useEffect(()=>{load();},[]);
  const cards=[['Equipment & Calibration',data.eq,'equipment'],['Deviations & CAPA',data.dev,'deviations'],['Stability Studies',data.st,'stability'],['Recalls & Traceability',data.rec,'recalls'],['Vendor Qualification',data.vq,'vendors'],['AYUSH QC Specifications',data.spec,'specifications']];
  return <ScrollView style={{flex:1,backgroundColor:colors.background}} contentContainerStyle={styles.container}><ScreenHeader title="GMP & AYUSH Compliance" subtitle="Connected manufacturing quality controls" />
    {loading?<ActivityIndicator size="large" />:error?<Text style={styles.error}>{error}</Text>:cards.map(([title,items,key])=><View key={key} style={[styles.card,{backgroundColor:colors.card,borderColor:colors.border}]}><View style={styles.row}><View><Text style={[styles.title,{color:colors.text}]}>{title}</Text><Text style={[styles.count,{color:colors.text}]}>{Array.isArray(items)?items.length:0} records</Text></View><Text style={[styles.badge,{color:colors.text}]}>CONNECTED</Text></View><Text style={[styles.note,{color:colors.textSecondary}]}>This module is now surfaced from the backend and can be used alongside BMR/QA release controls.</Text></View>)}
    <TouchableOpacity onPress={load} style={styles.refresh}><Text style={{color:'#fff',fontWeight:'700'}}>Refresh compliance data</Text></TouchableOpacity>
  </ScrollView>
}
const styles=StyleSheet.create({container:{padding:20,gap:14},card:{padding:18,borderWidth:1,borderRadius:12},row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},title:{fontSize:17,fontWeight:'800'},count:{fontSize:13,marginTop:4},badge:{fontSize:11,fontWeight:'800'},note:{marginTop:12,lineHeight:19},error:{padding:20},refresh:{padding:14,backgroundColor:'#2457a6',borderRadius:10,alignItems:'center',marginBottom:20}});
