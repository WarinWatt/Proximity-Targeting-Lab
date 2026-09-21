import {renderERD} from './erd.mjs';
import {entities,relations} from './schema.mjs';
document.getElementById('schema-count').textContent=Object.keys(entities).length+' ตาราง · '+relations.length+' ความสัมพันธ์';
renderERD(document.getElementById('erd-diagrams'),document.getElementById('erd-tables'));
