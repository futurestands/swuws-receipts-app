# Workbook formula review register

Read-only review of `global target (1).xlsx`. Every formula and nonempty input cell is preserved in `workbook-evidence.json`. Values are saved caches. A flag is an investigation aid, not an approved correction. Numeric literals include legitimate unit conversions and numbering increments. Blank reference flags list explicit direct cell references, not every empty cell within SUM ranges. External formula references are kept separately.

| Sheet | Nonempty cells | Formulas | Saved errors | External formulas | Literal-bearing formulas | Formulas with blank direct references |
|---|---:|---:|---:|---:|---:|---:|
| METHODOLOGY | 12 | 0 | 0 | 0 | 0 | 0 |
| KIGEZI | 337 | 96 | 0 | 0 | 76 | 0 |
| RUJUMBURA | 259 | 77 | 0 | 0 | 39 | 4 |
| ISINGIRO | 158 | 47 | 0 | 0 | 23 | 1 |
| ANKOLE | 208 | 67 | 4 | 0 | 33 | 7 |
| GLOBAL SUMMERY | 1029 | 534 | 11 | 0 | 130 | 145 |
| TARGETS GOLBAL | 1162 | 460 | 2 | 53 | 250 | 24 |
| Sheet1 | 0 | 0 | 0 | 0 | 0 | 0 |
| KABALE | 160 | 40 | 0 | 7 | 13 | 2 |
| NYARUSHANJE | 145 | 27 | 0 | 7 | 13 | 0 |
| KISORO& KANUNGU | 177 | 32 | 2 | 6 | 14 | 1 |
| RUKUNGIRI | 142 | 27 | 0 | 6 | 13 | 1 |
| NTUNGAMO | 174 | 32 | 0 | 6 | 14 | 3 |
|  ISG.MAIN | 145 | 27 | 0 | 7 | 13 | 0 |
| RUGAGA | 124 | 32 | 0 | 4 | 8 | 3 |
| BUSHENYI | 77 | 11 | 0 | 3 | 5 | 0 |
| IBANDA | 121 | 29 | 0 | 4 | 8 | 4 |
| RUBIRIZI | 111 | 17 | 0 | 3 | 7 | 0 |

## METHODOLOGY

Saved errors: none.

### Literal-bearing formula families

None.

### External formulas

None.

### Formulas with blank direct references

None.

## KIGEZI

Saved errors: none.

### Literal-bearing formula families

- `={cell}*3.6`: `L2`, `L4`, `L7`, `L8`, `L10`, `L12`, `L13`, `L14`, `L15`, `L16`, `L17`, `L18`, `L19`, `L20`, `L21`, `L22`, `L24`, `L25`, `L26`, `L28`, `L29`.
- `={cell}*24`: `M2`, `M5`, `M9`, `M12`, `M13`, `M17`, `M18`, `M19`, `M20`, `M21`, `M22`, `M23`, `M24`, `M28`, `M29`.
- `={cell}*30`: `N2`, `N3`, `N5`, `N7`, `N9`, `N10`, `N12`, `N13`, `N14`, `N17`, `N18`, `N19`, `N20`, `N21`, `N22`, `N23`, `N24`, `N25`, `N27`, `N28`, `N29`, `N30`, `N31`.
- `={cell}+1`: `C3`, `C5`, `C18`, `C19`, `C20`, `C21`, `C22`, `C23`, `C24`, `C27`.
- `=({cell}+{cell})*3.6`: `L5`.
- `=({cell}+{cell})*24`: `M7`, `M25`.
- `=({cell}*24)+({cell}*{cell})`: `M10`.
- `=({cell}+{cell}+{cell})*24`: `M14`.
- `={cell}/3.6`: `K27`.
- `=24*{cell}`: `M27`.

### External formulas

None.

### Formulas with blank direct references

None.

## RUJUMBURA

Saved errors: none.

### Literal-bearing formula families

- `=(3600*10*0.01)/{cell}`: `L4`.
- `={cell}*30`: `N4`, `N5`, `N6`, `N9`, `N10`, `N11`, `N16`, `N17`, `N18`, `N20`, `N21`, `N22`, `N24`, `N26`, `N27`, `N28`.
- `={cell}*3.6`: `L5`, `L6`, `L7`, `L10`, `L12`, `L13`, `L14`, `L15`, `L17`, `L20`, `L21`, `L22`, `L23`, `L25`, `L26`, `L27`.
- `=(({cell}+{cell})*24)+({cell}*{cell})`: `M6`.
- `=(3600*10*0.1)/{cell}`: `L8`, `L9`, `L16`.
- `=({cell}+{cell}+{cell}+{cell}+{cell})*24`: `M11`.
- `=({cell}+{cell})*24`: `M22`.

### External formulas

None.

### Formulas with blank direct references

- `K4`: `=H4/J4`; blank: `H4`.
- `K8`: `=H8/J8`; blank: `H8`.
- `K9`: `=H9/J9`; blank: `H9`.
- `K28`: `=H28/J28`; blank: `H28`.

## ISINGIRO

Saved errors: none.

### Literal-bearing formula families

- `={cell}*3.6`: `L2`, `L5`, `L6`, `L10`, `L11`, `L12`, `L13`, `L14`, `L16`.
- `={cell}*30`: `N2`, `N4`, `N5`, `N6`, `N7`, `N8`, `N9`, `N10`, `N12`, `N14`, `N15`, `N16`.
- `=8+16`: `G12`.
- `=(3600*10*0.01)/{cell}`: `L15`.

### External formulas

None.

### Formulas with blank direct references

- `K15`: `=H15/J15`; blank: `H15`.

## ANKOLE

Saved errors: `K16` #DIV/0!, `K17` #DIV/0!, `K20` #DIV/0!, `K21` #DIV/0!.

### Literal-bearing formula families

- `={cell}*3.6`: `L3`, `L4`, `L5`, `L7`, `L8`, `L9`, `L10`, `L11`, `L12`, `L14`, `L15`, `L18`, `L19`, `L22`, `L23`, `L24`.
- `={cell}*30`: `N3`, `N7`, `N10`, `N12`, `N14`, `N16`, `N17`, `N18`, `N19`, `N20`, `N21`, `N22`, `N23`, `N24`.
- `=({cell}+{cell}+{cell})*24`: `M7`.
- `=({cell}+{cell})*24`: `M10`, `M14`.

### External formulas

None.

### Formulas with blank direct references

- `K16`: `=H16/J16`; blank: `H16`, `J16`.
- `K17`: `=H17/J17`; blank: `J17`.
- `L19`: `=K19*3.6`; blank: `K19`.
- `M19`: `=L19*G19`; blank: `G19`.
- `K20`: `=H20/J20`; blank: `J20`.
- `K21`: `=H21/J21`; blank: `J21`.
- `M25`: `=L25*G25`; blank: `L25`, `G25`.

## GLOBAL SUMMERY

Saved errors: `Q24` #DIV/0!, `Q25` #DIV/0!, `R25` #DIV/0!, `S25` #DIV/0!, `Q26` #DIV/0!, `R26` #DIV/0!, `Q30` #DIV/0!, `Q33` #DIV/0!, `Q42` #DIV/0!, `Q43` #DIV/0!, `R43` #DIV/0!.

### Literal-bearing formula families

- `={cell}/60`: `K3`, `K4`, `K5`, `K6`, `K7`, `K8`, `K9`, `K10`, `K11`, `K12`, `K13`, `K14`, `K15`, `K16`, `K17`, `K18`, `K19`, `K20`, `K21`, `K22`, `K23`, `K24`, `K25`, `K26`, `K27`, `K28`, `K29`, `K30`, `K31`, `K32`, `K33`, `K34`, `K35`, `K36`, `K37`, `K38`, `K39`, `K40`, `K41`, `K42`, `K43`, `K44`, `K45`, `K46`, `K47`, `K48`, `K49`, `K50`, `K51`, `K52`, `K53`, `K54`, `K55`, `K57`, `K58`, `K59`, `K60`, `K61`, `K62`, `K63`, `K64`, `K65`, `K66`, `K67`, `K68`, `K69`.
- `={cell}+1`: `C4`, `C5`, `C6`, `C7`, `C8`, `C9`, `C10`, `C11`, `C12`, `C13`, `C14`, `C15`, `C16`, `C17`, `C18`, `C19`, `C20`, `C21`, `C22`, `C23`, `C24`, `C25`, `C28`, `C29`, `C30`, `C31`, `C32`, `C33`, `C34`, `C35`, `C36`, `C37`, `C38`, `C39`, `C40`, `C41`, `C42`, `C45`, `C46`, `C47`, `C48`, `C49`, `C50`, `C51`, `C52`, `C53`, `C54`, `C55`, `C58`, `C59`, `C60`, `C61`, `C62`, `C63`, `C64`, `C65`, `C66`, `C67`, `C68`, `C69`.
- `={cell}*30`: `F27`.
- `=4869+717`: `M44`.
- `=4696+257`: `N44`.
- `=2118*{cell}`: `F73`.

### External formulas

None.

### Formulas with blank direct references

- `J3`: `=I3+H3+G3`; blank: `I3`.
- `P3`: `=M3+N3+O3`; blank: `O3`.
- `J4`: `=I4+H4+G4`; blank: `I4`.
- `P4`: `=M4+N4+O4`; blank: `O4`.
- `J5`: `=I5+H5+G5`; blank: `I5`.
- `P5`: `=M5+N5+O5`; blank: `O5`.
- `J6`: `=I6+H6+G6`; blank: `I6`.
- `P6`: `=M6+N6+O6`; blank: `O6`.
- `J7`: `=I7+H7+G7`; blank: `I7`.
- `P7`: `=M7+N7+O7`; blank: `O7`.
- `J8`: `=I8+H8+G8`; blank: `I8`.
- `P8`: `=M8+N8+O8`; blank: `O8`.
- `J9`: `=I9+H9+G9`; blank: `I9`.
- `P9`: `=M9+N9+O9`; blank: `O9`.
- `J10`: `=I10+H10+G10`; blank: `I10`.
- `P10`: `=M10+N10+O10`; blank: `O10`.
- `J11`: `=I11+H11+G11`; blank: `I11`.
- `P11`: `=M11+N11+O11`; blank: `O11`.
- `J12`: `=I12+H12+G12`; blank: `I12`.
- `P12`: `=M12+N12+O12`; blank: `O12`.
- `J13`: `=I13+H13+G13`; blank: `I13`.
- `P13`: `=M13+N13+O13`; blank: `O13`.
- `J14`: `=I14+H14+G14`; blank: `I14`.
- `P14`: `=M14+N14+O14`; blank: `O14`.
- `J15`: `=I15+H15+G15`; blank: `I15`.
- `P15`: `=M15+N15+O15`; blank: `O15`.
- `J16`: `=I16+H16+G16`; blank: `I16`.
- `P16`: `=M16+N16+O16`; blank: `O16`.
- `J17`: `=I17+H17+G17`; blank: `I17`.
- `P17`: `=M17+N17+O17`; blank: `O17`.
- `J18`: `=I18+H18+G18`; blank: `I18`.
- `P18`: `=M18+N18+O18`; blank: `O18`.
- `J19`: `=I19+H19+G19`; blank: `I19`.
- `P19`: `=M19+N19+O19`; blank: `O19`.
- `J20`: `=I20+H20+G20`; blank: `I20`.
- `P20`: `=M20+N20+O20`; blank: `O20`.
- `J21`: `=I21+H21+G21`; blank: `I21`.
- `P21`: `=M21+N21+O21`; blank: `O21`.
- `J22`: `=I22+H22+G22`; blank: `I22`.
- `P22`: `=M22+N22+O22`; blank: `O22`.
- `J23`: `=I23+H23+G23`; blank: `I23`.
- `P23`: `=M23+N23+O23`; blank: `O23`.
- `J24`: `=I24+H24+G24`; blank: `I24`.
- `P24`: `=M24+N24+O24`; blank: `O24`.
- `J25`: `=I25+H25+G25`; blank: `I25`, `H25`.
- `P25`: `=M25+N25+O25`; blank: `O25`.
- `R25`: `=(H25-N25)/H25`; blank: `H25`.
- `J26`: `=I26+H26+G26`; blank: `I26`, `H26`, `G26`.
- `P26`: `=M26+N26+O26`; blank: `M26`, `N26`, `O26`.
- `Q26`: `=((G26-M26)/G26)`; blank: `G26`, `M26`.
- `R26`: `=(H26-N26)/H26`; blank: `H26`, `N26`.
- `J27`: `=I27+H27+G27`; blank: `I27`.
- `P27`: `=M27+N27+O27`; blank: `O27`.
- `J28`: `=I28+H28+G28`; blank: `I28`.
- `P28`: `=M28+N28+O28`; blank: `O28`.
- `J29`: `=I29+H29+G29`; blank: `I29`.
- `P29`: `=M29+N29+O29`; blank: `O29`.
- `J30`: `=I30+H30+G30`; blank: `I30`, `G30`.
- `P30`: `=M30+N30+O30`; blank: `M30`, `O30`.
- `Q30`: `=((G30-M30)/G30)`; blank: `G30`, `M30`.
- `J31`: `=I31+H31+G31`; blank: `I31`.
- `P31`: `=M31+N31+O31`; blank: `O31`.
- `J32`: `=I32+H32+G32`; blank: `I32`.
- `P32`: `=M32+N32+O32`; blank: `O32`.
- `J33`: `=I33+H33+G33`; blank: `I33`, `G33`.
- `P33`: `=M33+N33+O33`; blank: `O33`.
- `Q33`: `=((G33-M33)/G33)`; blank: `G33`.
- `J34`: `=I34+H34+G34`; blank: `I34`.
- `P34`: `=M34+N34+O34`; blank: `O34`.
- `J35`: `=I35+H35+G35`; blank: `I35`.
- `P35`: `=M35+N35+O35`; blank: `O35`.
- `J36`: `=I36+H36+G36`; blank: `I36`.
- `P36`: `=M36+N36+O36`; blank: `O36`.
- `J37`: `=I37+H37+G37`; blank: `I37`.
- `P37`: `=M37+N37+O37`; blank: `O37`.
- `J38`: `=I38+H38+G38`; blank: `I38`.
- `P38`: `=M38+N38+O38`; blank: `O38`.
- `J39`: `=I39+H39+G39`; blank: `I39`.
- `P39`: `=M39+N39+O39`; blank: `O39`.
- `J40`: `=I40+H40+G40`; blank: `I40`.
- `P40`: `=M40+N40+O40`; blank: `O40`.
- `J41`: `=I41+H41+G41`; blank: `I41`.
- `P41`: `=M41+N41+O41`; blank: `O41`.
- `J42`: `=I42+H42+G42`; blank: `I42`, `G42`.
- `P42`: `=M42+N42+O42`; blank: `M42`, `N42`, `O42`.
- `Q42`: `=((G42-M42)/G42)`; blank: `G42`, `M42`.
- `R42`: `=(H42-N42)/H42`; blank: `N42`.
- `J43`: `=I43+H43+G43`; blank: `I43`, `H43`, `G43`.
- `P43`: `=M43+N43+O43`; blank: `M43`, `N43`, `O43`.
- `Q43`: `=((G43-M43)/G43)`; blank: `G43`, `M43`.
- `R43`: `=(H43-N43)/H43`; blank: `H43`, `N43`.
- `J44`: `=I44+H44+G44`; blank: `I44`.
- `P44`: `=M44+N44+O44`; blank: `O44`.
- `J45`: `=I45+H45+G45`; blank: `I45`.
- `P45`: `=M45+N45+O45`; blank: `O45`.
- `J46`: `=I46+H46+G46`; blank: `I46`.
- `P46`: `=M46+N46+O46`; blank: `O46`.
- `J47`: `=I47+H47+G47`; blank: `I47`.
- `P47`: `=M47+N47+O47`; blank: `O47`.
- `J48`: `=I48+H48+G48`; blank: `I48`.
- `P48`: `=M48+N48+O48`; blank: `O48`.
- `J49`: `=I49+H49+G49`; blank: `I49`.
- `P49`: `=M49+N49+O49`; blank: `O49`.
- `J50`: `=I50+H50+G50`; blank: `I50`.
- `P50`: `=M50+N50+O50`; blank: `O50`.
- `J51`: `=I51+H51+G51`; blank: `I51`.
- `P51`: `=M51+N51+O51`; blank: `O51`.
- `J52`: `=I52+H52+G52`; blank: `I52`.
- `P52`: `=M52+N52+O52`; blank: `O52`.
- `J53`: `=I53+H53+G53`; blank: `I53`.
- `P53`: `=M53+N53+O53`; blank: `O53`.
- `J54`: `=I54+H54+G54`; blank: `I54`.
- `P54`: `=M54+N54+O54`; blank: `O54`.
- `J55`: `=I55+H55+G55`; blank: `I55`.
- `P55`: `=M55+N55+O55`; blank: `O55`.
- `J57`: `=I57+H57+G57`; blank: `I57`.
- `P57`: `=M57+N57+O57`; blank: `O57`.
- `J58`: `=I58+H58+G58`; blank: `I58`.
- `P58`: `=M58+N58+O58`; blank: `O58`.
- `J59`: `=I59+H59+G59`; blank: `I59`.
- `P59`: `=M59+N59+O59`; blank: `O59`.
- `J60`: `=I60+H60+G60`; blank: `I60`.
- `P60`: `=M60+N60+O60`; blank: `O60`.
- `J61`: `=I61+H61+G61`; blank: `I61`.
- `P61`: `=M61+N61+O61`; blank: `O61`.
- `J62`: `=I62+H62+G62`; blank: `I62`.
- `P62`: `=M62+N62+O62`; blank: `O62`.
- `J63`: `=I63+H63+G63`; blank: `I63`.
- `P63`: `=M63+N63+O63`; blank: `O63`.
- `J64`: `=I64+H64+G64`; blank: `I64`.
- `P64`: `=M64+N64+O64`; blank: `O64`.
- `J65`: `=I65+H65+G65`; blank: `I65`.
- `P65`: `=M65+N65+O65`; blank: `O65`.
- `J66`: `=I66+H66+G66`; blank: `I66`.
- `P66`: `=M66+N66+O66`; blank: `O66`.
- `J67`: `=I67+H67+G67`; blank: `I67`.
- `P67`: `=M67+N67+O67`; blank: `O67`.
- `J68`: `=I68+H68+G68`; blank: `I68`.
- `P68`: `=M68+N68+O68`; blank: `O68`.
- `J69`: `=I69+H69+G69`; blank: `I69`.
- `P69`: `=M69+N69+O69`; blank: `O69`.
- `F71`: `=SUM(F3:F70)`; blank: `F70`.
- `M71`: `=SUM(M3:M70)`; blank: `M70`.
- `N71`: `=SUM(N3:N70)`; blank: `N70`.
- `P71`: `=SUM(P3:P70)`; blank: `P70`.

## TARGETS GOLBAL

Saved errors: `I27` #DIV/0!, `J27` #DIV/0!.

### Literal-bearing formula families

- `={cell}-(5%*{cell})`: `M5`, `M6`, `M7`, `M8`, `M9`, `M10`, `M11`, `M12`, `M13`, `M14`, `M15`, `M16`, `M17`, `M18`, `M19`, `M20`, `M21`, `M22`, `M23`, `M24`, `M25`, `M26`, `M27`, `M28`, `M29`, `M30`, `M31`, `M32`, `M33`, `M34`, `M35`, `M36`, `M37`, `M38`, `M39`, `M40`, `M41`, `M42`, `M43`, `M44`, `M45`, `M46`, `M47`, `M48`, `M49`, `M50`, `M51`, `M52`, `M53`, `M54`, `M55`, `M56`, `M57`, `M58`, `M59`, `M60`, `M61`, `M62`, `M63`, `M64`, `M65`, `M66`, `M67`, `M68`, `M69`, `M70`, `M71`.
- `={cell}-(0.25*{cell})`: `P5`, `P6`, `P7`, `P8`, `P9`, `P10`, `P11`, `P12`, `P13`, `P14`, `P15`, `P16`, `P17`, `P18`, `P19`, `P20`, `P21`, `P22`, `P23`, `P24`, `P25`, `P26`, `P27`, `P28`, `P29`, `P30`, `P31`, `P32`, `P33`, `P34`, `P35`, `P36`, `P37`, `P38`, `P39`, `P40`, `P41`, `P42`, `P43`, `P44`, `P45`, `P46`, `P47`, `P48`, `P49`, `P50`, `P51`, `P52`, `P53`, `P54`, `P55`, `P56`, `P57`, `P58`, `P59`, `P60`, `P61`, `P62`, `P63`, `P64`, `P65`, `P66`, `P67`, `P68`, `P69`, `P70`, `P71`.
- `=VLOOKUP([1]Arrears!{cell},[2]Sheet1!$1:$1048576,7,FALSE)`: `R5`, `R6`, `R7`, `R8`, `R9`, `R10`, `R11`, `R12`, `R13`, `R14`, `R15`, `R16`, `R17`, `R18`, `R19`, `R20`, `R21`, `R22`, `R23`, `R25`, `R29`, `R30`, `R31`, `R32`, `R33`, `R34`, `R36`, `R38`, `R39`, `R40`, `R42`, `R43`, `R46`, `R47`, `R48`, `R49`, `R50`, `R51`, `R52`, `R53`, `R54`, `R55`, `R56`, `R59`, `R60`, `R61`, `R62`, `R63`, `R64`, `R65`, `R67`, `R70`, `R71`.
- `={cell}+1`: `C6`, `C7`, `C8`, `C9`, `C10`, `C11`, `C12`, `C13`, `C14`, `C15`, `C16`, `C17`, `C18`, `C19`, `C20`, `C21`, `C22`, `C23`, `C24`, `C25`, `C26`, `C27`, `C30`, `C31`, `C32`, `C33`, `C34`, `C35`, `C36`, `C37`, `C38`, `C39`, `C40`, `C41`, `C42`, `C43`, `C44`, `C47`, `C48`, `C49`, `C50`, `C51`, `C52`, `C53`, `C54`, `C55`, `C56`, `C57`, `C60`, `C61`, `C62`, `C63`, `C64`, `C65`, `C66`, `C67`, `C68`, `C69`, `C70`, `C71`.
- `={cell}*30`: `F29`.
- `=({cell}-287393820)/{cell}`: `P79`.
- `=({cell}-245640.1)/{cell}`: `P81`.

### External formulas

- `R5`: `=VLOOKUP([1]Arrears!B42,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 6617806.
- `R6`: `=VLOOKUP([1]Arrears!B40,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 7532279.
- `R7`: `=VLOOKUP([1]Arrears!B41,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 35850524.
- `R8`: `=VLOOKUP([1]Arrears!B39,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 15207296.
- `R9`: `=VLOOKUP([1]Arrears!B43,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 6448807.
- `R10`: `=VLOOKUP([1]Arrears!B37,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 19307826.
- `R11`: `=VLOOKUP([1]Arrears!B38,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 11627350.
- `R12`: `=VLOOKUP([1]Arrears!B69,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 9159239.
- `R13`: `=VLOOKUP([1]Arrears!B74,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 31462060.
- `R14`: `=VLOOKUP([1]Arrears!B75,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 310364.
- `R15`: `=VLOOKUP([1]Arrears!B71,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 27851390.
- `R16`: `=VLOOKUP([1]Arrears!B70,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 15759874.
- `R17`: `=VLOOKUP([1]Arrears!B73,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 17009220.
- `R18`: `=VLOOKUP([1]Arrears!B72,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 13400681.
- `R19`: `=VLOOKUP([1]Arrears!B28,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 36115033.
- `R20`: `=VLOOKUP([1]Arrears!B34,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 4442509.
- `R21`: `=VLOOKUP([1]Arrears!B33,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 16227424.
- `R22`: `=VLOOKUP([1]Arrears!B31,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 46015341.
- `R23`: `=VLOOKUP([1]Arrears!B32,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 44226459.
- `R25`: `=VLOOKUP([1]Arrears!B29,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 1629156.
- `R29`: `=VLOOKUP([1]Arrears!B58,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 32452416.
- `R30`: `=VLOOKUP([1]Arrears!B56,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 25693237.
- `R31`: `=VLOOKUP([1]Arrears!B55,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 25359011.
- `R32`: `=VLOOKUP([1]Arrears!B60,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 2354552.
- `R33`: `=VLOOKUP([1]Arrears!B59,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 1710322.
- `R34`: `=VLOOKUP([1]Arrears!B57,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 20411948.
- `R36`: `=VLOOKUP([1]Arrears!B48,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 7009542.
- `R38`: `=VLOOKUP([1]Arrears!B51,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 14214189.
- `R39`: `=VLOOKUP([1]Arrears!B50,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 9986574.
- `R40`: `=VLOOKUP([1]Arrears!B52,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 2679938.
- `R42`: `=VLOOKUP([1]Arrears!B49,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 7191487.
- `R43`: `=VLOOKUP([1]Arrears!B46,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 31921073.
- `R46`: `=VLOOKUP([1]Arrears!B19,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 110585103.
- `R47`: `=VLOOKUP([1]Arrears!B23,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 18207849.
- `R48`: `=VLOOKUP([1]Arrears!B20,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 16167152.
- `R49`: `=VLOOKUP([1]Arrears!B21,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 32757411.
- `R50`: `=VLOOKUP([1]Arrears!B22,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 16013714.
- `R51`: `=VLOOKUP([1]Arrears!B25,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 945422.
- `R52`: `=VLOOKUP([1]Arrears!B26,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 680918.
- `R53`: `=VLOOKUP([1]Arrears!B63,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 41928453.
- `R54`: `=VLOOKUP([1]Arrears!B64,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 9406718.
- `R55`: `=VLOOKUP([1]Arrears!B65,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 360659.
- `R56`: `=VLOOKUP([1]Arrears!B66,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 2136182.
- `R59`: `=VLOOKUP([1]Arrears!B3,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 86236675.
- `R60`: `=VLOOKUP([1]Arrears!B4,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 75949825.
- `R61`: `=VLOOKUP([1]Arrears!B2,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 15373321.
- `R62`: `=VLOOKUP([1]Arrears!B12,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 66996963.
- `R63`: `=VLOOKUP([1]Arrears!B14,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 12257958.
- `R64`: `=VLOOKUP([1]Arrears!B13,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 25345004.
- `R65`: `=VLOOKUP([1]Arrears!B17,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 393658.
- `R67`: `=VLOOKUP([1]Arrears!B9,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 13929443.
- `R70`: `=VLOOKUP([1]Arrears!B7,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 1853692.
- `R71`: `=VLOOKUP([1]Arrears!B6,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 3964870.

### Formulas with blank direct references

- `S24`: `=R24+Q24`; blank: `R24`.
- `L27`: `=H27*F27`; blank: `H27`.
- `L28`: `=H28*F28`; blank: `H28`, `F28`.
- `Q28`: `=P28*U28`; blank: `U28`.
- `S28`: `=R28+Q28`; blank: `R28`.
- `S35`: `=R35+Q35`; blank: `R35`.
- `S37`: `=R37+Q37`; blank: `R37`.
- `S41`: `=R41+Q41`; blank: `R41`.
- `S44`: `=R44+Q44`; blank: `R44`.
- `L45`: `=H45*F45`; blank: `H45`, `F45`.
- `S57`: `=R57+Q57`; blank: `R57`.
- `L58`: `=H58*F58`; blank: `H58`, `F58`.
- `S66`: `=R66+Q66`; blank: `R66`.
- `F74`: `=SUM(F5:F73)`; blank: `F73`.
- `K74`: `=SUM(K5:K73)`; blank: `K73`.
- `L74`: `=SUM(L5:L73)`; blank: `L73`.
- `M74`: `=SUM(M5:M73)`; blank: `M73`.
- `N74`: `=SUM(N5:N73)`; blank: `N5`, `N73`.
- `O74`: `=SUM(O5:O73)`; blank: `O73`.
- `P74`: `=SUM(P5:P73)`; blank: `P73`.
- `Q74`: `=SUM(Q5:Q73)`; blank: `Q73`.
- `R74`: `=SUM(R5:R73)`; blank: `R73`.
- `S74`: `=SUM(S5:S73)`; blank: `S73`.
- `T74`: `=SUM(T5:T73)`; blank: `T5`, `T73`.

## Sheet1

Saved errors: none.

### Literal-bearing formula families

None.

### External formulas

None.

### Formulas with blank direct references

None.

## KABALE

Saved errors: none.

### Literal-bearing formula families

- `=VLOOKUP([1]Arrears!{cell},[2]Sheet1!$1:$1048576,7,FALSE)`: `R5`, `R6`, `R7`, `R8`, `R9`, `R10`, `R11`.
- `={cell}+1`: `C6`, `C7`, `C8`, `C9`, `C10`, `C11`.

### External formulas

- `R5`: `=VLOOKUP([1]Arrears!B42,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 6617806.
- `R6`: `=VLOOKUP([1]Arrears!B40,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 7532279.
- `R7`: `=VLOOKUP([1]Arrears!B41,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 35850524.
- `R8`: `=VLOOKUP([1]Arrears!B39,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 15207296.
- `R9`: `=VLOOKUP([1]Arrears!B43,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 6448807.
- `R10`: `=VLOOKUP([1]Arrears!B37,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 19307826.
- `R11`: `=VLOOKUP([1]Arrears!B38,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 11627350.

### Formulas with blank direct references

- `N12`: `=SUM(N5:N11)`; blank: `N5`, `N11`.
- `T12`: `=SUM(T5:T11)`; blank: `T5`, `T11`.

## NYARUSHANJE

Saved errors: none.

### Literal-bearing formula families

- `=VLOOKUP([1]Arrears!{cell},[2]Sheet1!$1:$1048576,7,FALSE)`: `R5`, `R6`, `R7`, `R8`, `R9`, `R10`, `R11`.
- `={cell}+1`: `C6`, `C7`, `C8`, `C9`, `C10`, `C11`.

### External formulas

- `R5`: `=VLOOKUP([1]Arrears!B69,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 9159239.
- `R6`: `=VLOOKUP([1]Arrears!B74,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 31462060.
- `R7`: `=VLOOKUP([1]Arrears!B75,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 310364.
- `R8`: `=VLOOKUP([1]Arrears!B71,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 27851390.
- `R9`: `=VLOOKUP([1]Arrears!B70,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 15759874.
- `R10`: `=VLOOKUP([1]Arrears!B73,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 17009220.
- `R11`: `=VLOOKUP([1]Arrears!B72,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 13400681.

### Formulas with blank direct references

None.

## KISORO& KANUNGU

Saved errors: `I13` #DIV/0!, `J13` #DIV/0!.

### Literal-bearing formula families

- `=VLOOKUP([1]Arrears!{cell},[2]Sheet1!$1:$1048576,7,FALSE)`: `R5`, `R6`, `R7`, `R8`, `R9`, `R11`.
- `={cell}+1`: `C6`, `C7`, `C8`, `C9`, `C10`, `C11`, `C12`, `C13`.

### External formulas

- `R5`: `=VLOOKUP([1]Arrears!B28,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 36115033.
- `R6`: `=VLOOKUP([1]Arrears!B34,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 4442509.
- `R7`: `=VLOOKUP([1]Arrears!B33,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 16227424.
- `R8`: `=VLOOKUP([1]Arrears!B31,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 46015341.
- `R9`: `=VLOOKUP([1]Arrears!B32,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 44226459.
- `R11`: `=VLOOKUP([1]Arrears!B29,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 1629156.

### Formulas with blank direct references

- `S10`: `=R10+Q10`; blank: `R10`.

## RUKUNGIRI

Saved errors: none.

### Literal-bearing formula families

- `={cell}*30`: `F5`.
- `=VLOOKUP([1]Arrears!{cell},[2]Sheet1!$1:$1048576,7,FALSE)`: `R5`, `R6`, `R7`, `R8`, `R9`, `R10`.
- `={cell}+1`: `C6`, `C7`, `C8`, `C9`, `C10`, `C11`.

### External formulas

- `R5`: `=VLOOKUP([1]Arrears!B58,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 32452416.
- `R6`: `=VLOOKUP([1]Arrears!B56,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 25693237.
- `R7`: `=VLOOKUP([1]Arrears!B55,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 25359011.
- `R8`: `=VLOOKUP([1]Arrears!B60,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 2354552.
- `R9`: `=VLOOKUP([1]Arrears!B59,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 1710322.
- `R10`: `=VLOOKUP([1]Arrears!B57,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 20411948.

### Formulas with blank direct references

- `S11`: `=R11+Q11`; blank: `R11`.

## NTUNGAMO

Saved errors: none.

### Literal-bearing formula families

- `=VLOOKUP([1]Arrears!{cell},[2]Sheet1!$1:$1048576,7,FALSE)`: `R5`, `R7`, `R8`, `R9`, `R11`, `R12`.
- `={cell}+1`: `C6`, `C7`, `C8`, `C9`, `C10`, `C11`, `C12`, `C13`.

### External formulas

- `R5`: `=VLOOKUP([1]Arrears!B48,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 7009542.
- `R7`: `=VLOOKUP([1]Arrears!B51,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 14214189.
- `R8`: `=VLOOKUP([1]Arrears!B50,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 9986574.
- `R9`: `=VLOOKUP([1]Arrears!B52,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 2679938.
- `R11`: `=VLOOKUP([1]Arrears!B49,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 7191487.
- `R12`: `=VLOOKUP([1]Arrears!B46,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 31921073.

### Formulas with blank direct references

- `S6`: `=R6+Q6`; blank: `R6`.
- `S10`: `=R10+Q10`; blank: `R10`.
- `S13`: `=R13+Q13`; blank: `R13`.

##  ISG.MAIN

Saved errors: none.

### Literal-bearing formula families

- `=VLOOKUP([1]Arrears!{cell},[2]Sheet1!$1:$1048576,7,FALSE)`: `R5`, `R6`, `R7`, `R8`, `R9`, `R10`, `R11`.
- `={cell}+1`: `C6`, `C7`, `C8`, `C9`, `C10`, `C11`.

### External formulas

- `R5`: `=VLOOKUP([1]Arrears!B19,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 110585103.
- `R6`: `=VLOOKUP([1]Arrears!B23,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 18207849.
- `R7`: `=VLOOKUP([1]Arrears!B20,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 16167152.
- `R8`: `=VLOOKUP([1]Arrears!B21,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 32757411.
- `R9`: `=VLOOKUP([1]Arrears!B22,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 16013714.
- `R10`: `=VLOOKUP([1]Arrears!B25,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 945422.
- `R11`: `=VLOOKUP([1]Arrears!B26,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 680918.

### Formulas with blank direct references

None.

## RUGAGA

Saved errors: none.

### Literal-bearing formula families

- `=VLOOKUP([1]Arrears!{cell},[2]Sheet1!$1:$1048576,7,FALSE)`: `R5`, `R6`, `R7`, `R8`.
- `={cell}+1`: `C6`, `C7`, `C8`, `C9`.

### External formulas

- `R5`: `=VLOOKUP([1]Arrears!B63,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 41928453.
- `R6`: `=VLOOKUP([1]Arrears!B64,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 9406718.
- `R7`: `=VLOOKUP([1]Arrears!B65,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 360659.
- `R8`: `=VLOOKUP([1]Arrears!B66,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 2136182.

### Formulas with blank direct references

- `S9`: `=R9+Q9`; blank: `R9`.
- `N10`: `=SUM(N5:N9)`; blank: `N5`, `N9`.
- `R10`: `=SUM(R5:R9)`; blank: `R9`.

## BUSHENYI

Saved errors: none.

### Literal-bearing formula families

- `=VLOOKUP([1]Arrears!{cell},[2]Sheet1!$1:$1048576,7,FALSE)`: `R5`, `R6`, `R7`.
- `={cell}+1`: `C6`, `C7`.

### External formulas

- `R5`: `=VLOOKUP([1]Arrears!B3,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 86236675.
- `R6`: `=VLOOKUP([1]Arrears!B4,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 75949825.
- `R7`: `=VLOOKUP([1]Arrears!B2,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 15373321.

### Formulas with blank direct references

None.

## IBANDA

Saved errors: none.

### Literal-bearing formula families

- `=VLOOKUP([1]Arrears!{cell},[2]Sheet1!$1:$1048576,7,FALSE)`: `R5`, `R6`, `R7`, `R8`.
- `={cell}+1`: `C6`, `C7`, `C8`, `C9`.

### External formulas

- `R5`: `=VLOOKUP([1]Arrears!B12,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 66996963.
- `R6`: `=VLOOKUP([1]Arrears!B14,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 12257958.
- `R7`: `=VLOOKUP([1]Arrears!B13,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 25345004.
- `R8`: `=VLOOKUP([1]Arrears!B17,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 393658.

### Formulas with blank direct references

- `S9`: `=R9+Q9`; blank: `R9`.
- `N10`: `=SUM(N5:N9)`; blank: `N5`, `N9`.
- `R10`: `=SUM(R5:R9)`; blank: `R9`.
- `T10`: `=SUM(T5:T9)`; blank: `T5`, `T9`.

## RUBIRIZI

Saved errors: none.

### Literal-bearing formula families

- `=VLOOKUP([1]Arrears!{cell},[2]Sheet1!$1:$1048576,7,FALSE)`: `R5`, `R8`, `R9`.
- `={cell}+1`: `C6`, `C7`, `C8`, `C9`.

### External formulas

- `R5`: `=VLOOKUP([1]Arrears!B9,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 13929443.
- `R8`: `=VLOOKUP([1]Arrears!B7,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 1853692.
- `R9`: `=VLOOKUP([1]Arrears!B6,[2]Sheet1!$1:$1048576,7,FALSE)`; saved value 3964870.

### Formulas with blank direct references

None.
