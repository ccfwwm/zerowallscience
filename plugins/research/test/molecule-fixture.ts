export const moleculeCif=`data_zerowall_reference
_entry.id ZWREF
_struct.title
;Synthetic two-chain coordinate reference
No biological interpretation
;
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_entity_id
_atom_site.label_seq_id
_atom_site.pdbx_PDB_ins_code
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
_atom_site.auth_seq_id
_atom_site.auth_comp_id
_atom_site.auth_asym_id
_atom_site.auth_atom_id
_atom_site.pdbx_PDB_model_num
ATOM 1 N N . GLY A 1 1 ? 0 0 0 1 20 1 GLY A N 1
ATOM 2 C CA . GLY A 1 1 ? 1.45 0 0 1 20 1 GLY A CA 1
ATOM 3 C C . GLY A 1 1 ? 2.1 1.35 0 1 20 1 GLY A C 1
ATOM 4 O O . GLY A 1 1 ? 1.5 2.4 0 1 20 1 GLY A O 1
ATOM 5 N N . ALA A 1 2 ? 3.4 1.4 0 1 20 2 ALA A N 1
ATOM 6 C CA . ALA A 1 2 ? 4.1 2.65 0 1 20 2 ALA A CA 1
ATOM 7 C C . ALA A 1 2 ? 5.6 2.5 0 1 20 2 ALA A C 1
ATOM 8 O O . ALA A 1 2 ? 6.2 1.45 0 1 20 2 ALA A O 1
HETATM 9 C C1 . LIG B 2 . ? 0 4 3 1 20 1 LIG B C1 1
HETATM 10 O O1 . LIG B 2 . ? 1.3 4 3 1 20 1 LIG B O1 1
#
`
export const moleculePdb=[
  'HEADER    SYNTHETIC SOFTWARE REFERENCE',
  'TITLE     TWO CHAINS; NO BIOLOGICAL CLAIM',
  ...[
    ['ATOM',1,'N','GLY','A',1,0,0,0,'N'],['ATOM',2,'CA','GLY','A',1,1.45,0,0,'C'],
    ['ATOM',3,'C','GLY','A',1,2.1,1.35,0,'C'],['ATOM',4,'O','GLY','A',1,1.5,2.4,0,'O'],
    ['ATOM',5,'N','ALA','A',2,3.4,1.4,0,'N'],['ATOM',6,'CA','ALA','A',2,4.1,2.65,0,'C'],
    ['ATOM',7,'C','ALA','A',2,5.6,2.5,0,'C'],['ATOM',8,'O','ALA','A',2,6.2,1.45,0,'O'],
    ['HETATM',9,'C1','LIG','B',1,0,4,3,'C'],['HETATM',10,'O1','LIG','B',1,1.3,4,3,'O'],
  ].map(([record,id,atom,res,chain,seq,x,y,z,element])=>`${String(record).padEnd(6)}${String(id).padStart(5)} ${String(atom).padStart(4)} ${res} ${chain}${String(seq).padStart(4)}    ${Number(x).toFixed(3).padStart(8)}${Number(y).toFixed(3).padStart(8)}${Number(z).toFixed(3).padStart(8)}  1.00 20.00          ${String(element).padStart(2)}`),
  'END','',
].join('\n')
