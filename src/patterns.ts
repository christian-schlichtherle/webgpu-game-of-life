export interface Pattern {
    name: string;
    expression: string;
}

export const PATTERNS: Pattern[] = [
    {
        name: "Random",
        expression: "Math.random() < .5",
    },
    {
        name: "Copperheads",
        expression: `{let r=row%12;let c=col%16;return ([2,7].includes(r)&&[4,5,6,8,9].includes(c)||[3,6].includes(r)&&[1,6,7,10,11].includes(c)||[4,5].includes(r)&&[0,1,7,12].includes(c))&&row/12<Math.floor(rows/12)&&col/16<Math.floor(cols/16)}`,
    },
    {
        name: "Gliders",
        expression: `{let f=(a,b)=>a/5<Math.floor(b/5);let r=row%5;let c=col%5;return(r===0&&c<3||r===1&&c===0||r===2&&c===1)&&f(row,rows)&&f(col,cols)}`,
    },
    {
        name: "Heavy Spaceships",
        expression: `{let r=row%7;let c=col%9;return (r===0&&c<6||r<3&&c===0||r===3&&[1,6].includes(c)||r===1&&c===6||r===4&&[3,4].includes(c))&&row/7<Math.floor(rows/7)&&col/9<Math.floor(cols/9)}`,
    },
    {
        name: "Light Spaceships",
        expression: `{let r=row%6;let c=col%7;return (r===0&&c<4||r<3&&c===0||r===3&&[1,4].includes(c)||r===1&&c===4)&&row/6<Math.floor(rows/6)&&col/7<Math.floor(cols/7)}`,
    },
    {
        name: "Medium Spaceships",
        expression: `{let r=row%7;let c=col%8;return (r===0&&c<5||r<3&&c===0||r===3&&[1,5].includes(c)||r===1&&c===5||r===4&&c===3)&&row/7<Math.floor(rows/7)&&col/8<Math.floor(cols/8)}`,
    },
    {
        name: "Loafers",
        expression: `{let f=(a,b)=>a/12<Math.floor(b/12);let r=row%12;let c=col%12;return (r===1&&[2,3,6,8,9].includes(c)||r===2&&[1,4,7,8].includes(c)||r===3&&[2,4].includes(c)||r===4&&c===3||r===5&&c===9||r===6&&[7,8,9].includes(c)||r===7&&c===6||r===8&&c===7||r===9&&[8,9].includes(c))&&f(row,rows)&&f(col,cols)}`,
    },
    {
        name: "Pentadecathlons",
        expression: `{let r=row%18;let c=col%11;return ([4,5,7,8,9,10,12,13].includes(r)&&c===5||[6,11].includes(r)&&[4,6].includes(c))&&row/18<Math.floor(rows/18)&&col/11<Math.floor(cols/11)}`,
    },
    {
        name: "Pulsars",
        expression: `{let f=(a,b)=>[2,7,9,14].includes(a)&&(3<b&&b<7||9<b&&b<13);let g=(a,b)=>a/17<Math.floor(b/17);let r=row%17;let c=col%17;return(f(r,c)||f(c,r))&&g(row,rows)&&g(col,cols)}`,
    },
    {
        name: "Kaleidoscope",
        expression: "row === 0 || col === 0",
    },
    {
        name: "Wave",
        expression: "row === 0",
    },
];

export function evaluateExpression(
    expr: string,
    width: number,
    height: number,
): Uint32Array {
    const cells = new Uint32Array(width * height);
    const body = expr.trimStart().startsWith("{") ? expr : `return (${expr})`;
    let fn: Function;
    try {
        fn = new Function("row", "col", "rows", "cols", body);
    } catch (e) {
        throw new Error(`Invalid pattern syntax: ${(e as Error).message}`);
    }
    try {
        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                cells[row * width + col] = fn(row, col, height, width) ? 1 : 0;
            }
        }
    } catch (e) {
        throw new Error(`Pattern evaluation failed: ${(e as Error).message}`);
    }
    return cells;
}

export function setupPatternSelector(
    onSelect: (expr: string) => void,
): void {
    const select = document.getElementById("pattern") as HTMLSelectElement;
    const textarea = document.getElementById("expression") as HTMLTextAreaElement;

    PATTERNS.forEach((p, i) => {
        const option = document.createElement("option");
        option.value = String(i);
        option.textContent = p.name;
        select.appendChild(option);
    });

    // Default to Random
    textarea.value = PATTERNS[0].expression;

    select.addEventListener("change", () => {
        const pattern = PATTERNS[Number(select.value)];
        textarea.value = pattern.expression;
        onSelect(pattern.expression);
    });

    document.getElementById("apply")!.addEventListener("click", () => {
        onSelect(textarea.value);
    });
}
