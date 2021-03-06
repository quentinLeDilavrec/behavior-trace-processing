"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const fs = require("fs");
const stream_1 = require("stream");
// const DEFAULT_CONFIG = {
//   user: 'ubehavior',
//   host: 'localhost',
//   database: 'behaviordb',
//   password: 'password',
//   port: 5432,
// }
// client.connect().then(
// client.query('SELECT NOW()', (err, res) => {
//   console.log(err, res)
//   client.end()
// })
function getFct(l, namespace) {
    return 'CONCAT(' + l.map(x => namespace ? namespace + '.' + x : x).join(",':',") + ')';
}
/**
 *
 * @param {*} cols
 * `
 * path = 'packages/hooks/src/createRunHook.js'
 * AND sl = 12
 * AND sc = 0
 * AND el = 71
 * AND ec = 1
 * `
 */
function genInitReq(cols, particulars = []) {
    return [`SELECT root, session, ${getFct(['path', 'sl', 'sc', 'el', 'ec'])} AS fct0, params AS params0, prev_line, next_line FROM CALLS
WHERE ` + [...cols.map(x => x + ' = ?'), ...particulars].join(' AND '), 'init', (x) => x + `.fct0, ` + x + `.params0, `];
}
// console.log(genInitReq(['path','sl','sc','el','ec']))
function genBehavioralReq(init_cols) {
    const idx = 0;
    return `SELECT init.root, init.session, 
    init.fct` + idx + `, init.params` + idx + `, 
    ${getFct(['path', 'sl', 'sc', 'el', 'ec'], 'CALLS')} AS fct1, CALLS.params AS params1,
    CALLS.line, CALLS.next_line
    FROM ( ${genInitReq(init_cols)} ) AS init
       , CALLS
    WHERE init.root = CALLS.root
    AND init.session = CALLS.session
    AND init.next_line = CALLS.line)`;
}
exports.genBehavioralReq = genBehavioralReq;
function move(dir, req, idx) {
    return [`SELECT ` + req[1] + `.root, ` + req[1] + `.session, 
` + req[2](req[1]) + `
${getFct(['path', 'sl', 'sc', 'el', 'ec'], 'CALLS')} AS fct_` + dir + idx + `, CALLS.params AS params_` + dir + idx + `,
CALLS.line, CALLS.` + dir + `_line, ` + req[1] + `.` + (dir === 'prev' ? 'next' : 'prev') + `_line
FROM (` + req[0].split('\n').join('\n      ') + `) AS ` + req[1] + `, 
     CALLS
WHERE ` + req[1] + `.root = CALLS.root
AND ` + req[1] + `.session = CALLS.session
AND ` + req[1] + `.` + dir + `_line = CALLS.line`, dir + idx, x => req[2](x) + x + `.fct_` + dir + idx + `, ` + x + `.params_` + dir + idx + `, `];
}
function applyReq(req, init_params) {
    return init_params.reduce((acc, x) => acc.replace('?', x), req);
}
// const req1 = move('prev',genInitReq(['path','sl','sc','el','ec']),1)
// console.log(req1[0])
// const req2 = move('prev',req1,2)
// console.log(req2[0])
// const req3 = move('next',req2,1)
// console.log(req3[0])
// console.log(applyReq(move('prev',genInitReq(['path','sl','sc','el','ec']),1)[0],["'packages/hooks/src/createRunHook.js'",12,0,71,1]));
// console.log(applyReq(req3[0],["'packages/hooks/src/createRunHook.js'",12,0,71,1]));
/**
 *
 * @param {string[]} keys like ['path','sl','sc','el','ec']
 * @param {any[]} values like ['packages/hooks/src/createRunHook.js', 12, 0, 71, 1]
 * @param {Array<'prev'|'next'>} moves like ['prev','next','next','prev','prev']
 */
function getPaths(config, keys, values, moves, particulars = []) {
    return __awaiter(this, void 0, void 0, function* () {
        const reqinf = moves.reduce((acc, x, i) => move(x === 'p' ? 'prev' : x === 'n' ? 'next' : x, acc, i), genInitReq(keys, particulars));
        const client = new pg_1.Client(config);
        yield client.connect();
        client.query(reqinf[0], values, function (err, _ok) {
            if (err)
                throw err;
            else
                console.log(JSON.stringify(_ok, undefined, '  '));
        });
        yield client.end();
    });
}
exports.getPaths = getPaths;
const QueryStream = require("pg-query-stream");
// import JSONStream = require('JSONStream');
const through2 = require("through2");
const path_1 = require("path");
// const myTransform = new Transform({
//   transform(chunk, encoding, callback) {
//     throw chunk
//     // console.log(chunk[0])
//     // callback(null,chunk)
//   }
// });
function req_as_object(config, req, params) {
    const client = new pg_1.Client(config);
    const outStream = new stream_1.PassThrough();
    client.connect().then(() => {
        // JSONStream.stringify()
        client.query(req, params)
            .then(res => outStream.write(JSON.stringify(res, undefined, '  ')))
            .catch(console.error)
            .then(() => (outStream.end(), client.end()));
    })
        .catch(err => console.error('connection error', err.stack));
    return outStream;
}
function req_as_stream(config, req, params, serializer, flush) {
    const outStream = new stream_1.PassThrough();
    const client = new pg_1.Client(config);
    client.connect().then(() => {
        const query = new QueryStream(req, params);
        const stream = client.query(query);
        stream.on('end', () => client.end());
        stream.on('error', x => (console.error(x), client.end()));
        stream.pipe(through2.obj(serializer, flush)).pipe(outStream);
    })
        .catch(err => console.error('connection error', err.stack));
    return outStream;
}
// export function getDistrib(size = 10000, order = 'pocc', origin = 'gutenberg') {
//   const group_columns = ['origin', 'path', 'sl', 'sc', 'el', 'ec']
//   const select_columns = []
//   const req = `
// SELaECT ${select_columns.map(x => x + ',').join(' ')}
// SUM((SIGN(session)>0)::int) as pocc,
// SUM((SIGN(session)<0)::int) as tocc
// FROM calls c
// WHERE origin = $1
// GROUP BY ${group_columns.join(', ')}
// ORDER BY ${order} DESC, ${order === 'pocc' ? 'tocc' : 'pocc'}
// LIMIT $2;
//   `
//   console.error(req)
//   return req_as_stream(req, [origin, size],
//     function mytransform(chunk: { pocc: string, tocc: string }, enc, cb) {
//       cb(null, chunk.pocc + ' ' + chunk.tocc + '\n')
//     })
// }
class DbPath {
    constructor(path, before) {
        this.path = path;
        this.before = before;
    }
    to_ltree() {
        return (path_1.join(this.before, this.path)
            .replace(/\/\*\*(\/\*$)?/g, '/*')
            .replace(/\ç/g, 'çç')
            .replace(/\./g, 'ç0')
            .replace(/\//g, '.')
            .replace(/\-/g, 'ç1'));
    }
    to_unix() {
        return path_1.join(this.before, this.path);
    }
    from_unix(path, before = '') {
        return new DbPath(path, before);
    }
    from_ltree(path, before = '') {
        throw 'not implemented';
    }
    first_star_pos() {
        return this.to_ltree().split('.').findIndex(x => x.indexOf('*') > -1);
    }
}
const posOrZero = (n) => n >= 0 ? n : 0;
function getMultiDistrib(config, path = 'packages/block*/**/*', order = 'pocc', origin = 'gutenberg') {
    const group_columns = ['origin', 'path', 'sl', 'sc', 'el', 'ec'];
    const formatedPath = DbPath.prototype.from_unix(path);
    const f_s_p = formatedPath.first_star_pos();
    const select_columns = [`formatPath(subpath(path,0,${posOrZero(f_s_p) + 1})) as package`,
        `CONCAT(formatPath(subpath(path,
    (CASE WHEN nlevel(path)>=${posOrZero(f_s_p) + 1} THEN nlevel(path)-1
    ELSE ${posOrZero(f_s_p) + 1} END) 
    )), ':', sl, ':', sc, ':', el, ':', ec) as fct`];
    console.error(select_columns);
    const req = `
SELECT ${select_columns.map(x => x + ',').join(' ')}
SUM((SIGN(session)>0)::int) as pocc,
SUM((SIGN(session)<0)::int) as tocc
FROM calls c
WHERE origin = $1
AND (session > 3 OR session < 0)
AND path ~ '${formatedPath.to_ltree()}'
AND not path ~ '*.test.*'
GROUP BY ${group_columns.join(', ')}
ORDER BY ${order} DESC, ${order === 'pocc' ? 'tocc' : 'pocc'}
;
  `;
    console.error(req);
    return req_as_stream(config, req, [origin], function mytransform(chunk, enc, cb) {
        cb(null, chunk.package + ' ' + chunk.fct + ' ' + chunk.pocc + ' ' + chunk.tocc + '\n');
    });
}
exports.getMultiDistrib = getMultiDistrib;
function getDistrib(config, path = 'packages/block*/**/*', n = 1, size = 10000, order = 'pocc', origin = 'gutenberg') {
    const formatedPath = DbPath.prototype.from_unix(path);
    const group_columns = ['origin', 'path', 'sl', 'sc', 'el', 'ec'];
    const f_s_p = formatedPath.first_star_pos();
    let req;
    if (n <= 1) {
        const select_columns = [`formatPath(subpath(path,0,${posOrZero(f_s_p) + 1})) as package`,
            `CONCAT(formatPath(subpath(path,
      (CASE WHEN nlevel(path)>=${posOrZero(f_s_p) + 1} THEN nlevel(path)-1
      ELSE ${posOrZero(f_s_p) + 1} END) 
      )), ':', sl, ':', sc, ':', el, ':', ec) as fct`];
        console.error(select_columns);
        req = `
  SELECT ${select_columns.map(x => x + ',').join(' ')}
  SUM((SIGN(session)>0)::int) as pocc,
  SUM((SIGN(session)<0)::int) as tocc
  FROM calls c
  WHERE origin = $1
  AND path ~ '${formatedPath.to_ltree()}'
  AND not path ~ '*.test.*'
  GROUP BY ${group_columns.join(', ')}
  ORDER BY ${order} DESC, ${order === 'pocc' ? 'tocc' : 'pocc'}
  ;
    `;
    }
    else {
        //     const reqSpread = `
        // SELECT ${getFct(['path', 'sl', 'sc', 'el', 'ec'],'c')}, g.n, g.hash, g.pocc, g.tocc
        // FROM get2gram('packages/hooks/src/createDoingHook.js',10,0,30,1) as g,
        //      calls c
        // WHERE 'gutenberg' = c.origin
        // AND 'gutenberg' = g.origin
        // AND c.session = g.session
        // AND line >= g.left
        // AND line < g.left+g.n
        // ORDER BY g.n, g.hash,g.session,c.line;
        // 
        const initpath = `
SELECT ${['origin', 'path', 'sl', 'sc', 'el', 'ec'].map(x => x + ',').join(' ')}
SUM((SIGN(session)>0)::int) as pocc,
SUM((SIGN(session)<0)::int) as tocc
FROM calls c
WHERE origin = $1
AND path ~ '${formatedPath.to_ltree()}'
AND not path ~ '*.test.*'
GROUP BY ${group_columns.join(', ')}
ORDER BY ${order} DESC, ${order === 'pocc' ? 'tocc' : 'pocc'}
LIMIT 20
`;
        const select_columns = f_s_p === -1 ?
            [`CONCAT(formatPath(path), ':', sl, ':', sc, ':', el, ':', ec) as package`,
                `CONCAT(formatPath(subpath(path,-1)), ':', sl, ':', sc, ':', el, ':', ec) as fct`]
            : [`formatPath(subpath(path,0,${posOrZero(f_s_p) + 1})) as package`,
                `CONCAT(formatPath(subpath(path,
      (CASE WHEN nlevel(path)>=${posOrZero(f_s_p) + 1} THEN nlevel(path)-1
      ELSE ${posOrZero(f_s_p) + 1} END) 
      )), ':', sl, ':', sc, ':', el, ':', ec) as fct`];
        console.error(select_columns);
        req = `
WITH initPaths AS (
  ${initpath}
)
SELECT ${select_columns.map(x => x + ',').join(' ')} g.pocc, g.tocc
FROM initPaths i, LATERAL getngrams(${escape(origin)},formatPath(i.path),i.sl,i.sc,i.el,i.ec,2::smallint) as g
ORDER BY g.pocc DESC, g.tocc;
    `;
    }
    console.error(req);
    // req = 'select * from groupTable where origin=$1'
    return req_as_stream(config, req, [origin], function mytransform(chunk /*{ pocc: string, tocc: string }*/, enc, cb) {
        // cb(null, chunk.pocc + ' ' + chunk.tocc + '\n')
        cb(null, chunk.package + ' ' + chunk.fct + ' ' + chunk.pocc + ' ' + chunk.tocc + '\n');
    });
}
exports.getDistrib = getDistrib;
function getTrace(config, session, computation, origin = 'gutenberg') {
    if (computation === 'mean_pos') {
        const req = `
SELECT MIN(session) as minsession, median(line) as minline, AVG(line) as avgline
FROM calls
WHERE origin = $1 ${session === undefined ? '' : 'AND session = S2'}
AND session > 0
AND nlevel(path)>1
GROUP BY session, path, sl, sc, el, ec
ORDER BY minline, minsession;
  `;
        return req_as_stream(config, req, session === undefined ? [origin] : [origin, session], function mytransform(chunk, enc, cb) {
            cb(null, chunk.avgline + '\n');
        });
    }
    else {
        const fct_columns = ['formatPath(path)', 'sl', 'sc', 'el', 'ec']; //  formatPath(subpath(path,1,1)) as fct
        const req = `
SELECT ${getFct(fct_columns)} as fct, params
FROM calls
WHERE origin = $1
AND session > 0
AND nlevel(path)>1
ORDER BY session,line;
  `;
        return req_as_stream(config, req, [origin], function mytransform(chunk, enc, cb) {
            cb(null, chunk.fct + ' ' + chunk.params + '\n');
        });
    }
}
exports.getTrace = getTrace;
if (typeof require != 'undefined' && require.main == module) {
    const DEFAULT_CONFIG = {
        user: 'ubehavior',
        host: 'localhost',
        database: 'behaviordb',
        password: 'password',
        port: 5432,
    };
    const out = process.argv.length < 3 ? process.stdout : fs.createWriteStream(process.argv[2]);
    // getDistrib()
    // getDistrib('packages/blocks/src/api/registration.js', 2)
    // getDistrib('packages/data/src/namespace-store/index.js', 2)
    // getDistrib('packages/data/src/registry.js', 2)
    // getDistrib('packages/data/src/components/with-select/index.js', 2)
    // getDistrib('packages/i18n/*', 2)
    // getDistrib('packages/block*/**/*', 2)
    // getDistrib('packages/blocks/src/store/*', 2)
    // getDistrib('packages/data/src/**/*', 2)
    // getDistrib('packages/blocks/src/store/selectors.js', 2)
    // getDistrib('packages/**/*', 1)
    // getDistrib('packages/data/src/registry.js', 2)
    // getTrace(2)
    // getTrace(2,'mean_pos')
    // getMultiDistrib('packages/*/**/*')
    getMultiDistrib(DEFAULT_CONFIG, 'packages/core-data/src/**/*')
        // getMultiDistribRoot() // just noise
        .pipe(out);
    // console.log(formatPath('packages/block*/**/*'))
    // console.log(formatPath('packages/blocks/**/*.js'))
    // console.log(formatPath('packages/block*/**/coucou*.js'))
}
//# sourceMappingURL=makerequests.js.map