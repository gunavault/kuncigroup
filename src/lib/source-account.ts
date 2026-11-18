import type {Category} from '@prisma/client';
export function classifySourceAccount(category:string,normal:string){
 const key=category.toUpperCase().replace(/[^A-Z]/g,'');
 const categories:Record<string,Category>={ASET:'ASET',KEWAJIBAN:'KEWAJIBAN',LIABILITAS:'KEWAJIBAN',EKUITAS:'EKUITAS',PENDAPATAN:'PENDAPATAN',BEBAN:'BEBAN',HPP:'BEBAN',BEBANUSAHA:'BEBAN',PAJAKPENGHASILAN:'BEBAN'};
 const mapped=key==='LAINLAIN'?(normal==='K'?'PENDAPATAN':'BEBAN'):categories[key];
 if(!mapped||!['D','K'].includes(normal))return null;
 return {category:mapped,normalBalance:normal==='D'?'DEBIT' as const:'KREDIT' as const,isContra:(mapped==='ASET'||mapped==='BEBAN')!==(normal==='D')};
}
