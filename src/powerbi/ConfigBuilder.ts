/*
 * Copyright (C) 2016 Microsoft
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { ITableSorterColumn, ITableSorterRow, ITableSorterConfiguration, ITableSorterLayoutColumn } from "../models";
import { default as Utils } from "essex.powerbi.base/src/lib/Utils";
import * as _ from "lodash";

/**
 * Gets a lineup config from the data view
 */
export default function(dataView: powerbi.DataView, data: ITableSorterRow[]): ITableSorterConfiguration {
    "use strict";
    if (dataView) {
        const newColArr = parseColumnsFromDataView(dataView, data);
        let config: ITableSorterConfiguration;
        if (dataView.metadata && dataView.metadata.objects && dataView.metadata.objects["layout"]) {
            let configStr = dataView.metadata.objects["layout"]["layout"];
            if (configStr) {
                config = JSON.parse(configStr);
            }
        }
        if (!config) {
            config = {
                primaryKey: newColArr[0].label,
                columns: newColArr,
            };
        } else {
            processExistingConfig(config, newColArr);
        }
        return config;
    }
}

/**
 * Parses columns from a data view
 */
function parseColumnsFromDataView(dataView: powerbi.DataView, data: ITableSorterRow[]) {
    "use strict";
    const dataViewTable = dataView.table;

    // Sometimes columns come in undefined
    return dataViewTable.columns.slice(0).filter(n => !!n).map((c) => {
        const base = {
            label: c.displayName,
            column: c.displayName,
            type: c.type.numeric ? "number" : "string",
        };
        if (c.type.numeric) {
            _.merge(base, {
                domain: calcDomain(data, base.column),
            });
        }
        return base;
    });
}

/**
 * Processes the existing config, removing unnecessary columns, and does some additional processing
 */
export function processExistingConfig(config: ITableSorterConfiguration, columns: ITableSorterColumn[]) {
    "use strict";
    let newColNames = columns.map(c => c.column);
    let oldConfig = _.merge({}, config);
    const oldCols = config.columns || [];

    // Filter out any columns that don't exist anymore
    config.columns = oldCols.filter(c =>
        newColNames.indexOf(c.column) >= 0
    );

    // Override the domain, with the newest data
    oldCols.forEach(n => {
        let newCol = columns.filter(m => m.column === n.column)[0];
        if (newCol && newCol.domain) {
            // Reset the domain, cause we now have a new set of data
            n.domain = newCol.domain.slice(0) as any;
        }
    });

    // Sort contains a missing column
    if (config.sort && newColNames.indexOf(config.sort.column) < 0 && !config.sort.stack) {
        config.sort = undefined;
    }

    // If we have a layout
    if (config.layout && config.layout.primary) {
        config.layout.primary = syncLayoutColumns(config.layout.primary, config.columns, oldConfig.columns);
    }

    removeMissingColumns(config, columns);
}

function removeMissingColumns(config: ITableSorterConfiguration, columns: ITableSorterColumn[]) {
    "use strict";
    Utils.listDiff<ITableSorterColumn>(config.columns.slice(0), columns, {
        /**
         * Returns true if item one equals item two
         */
        equals: (one, two) => one.label === two.label,

        /**
         * Gets called when the given item was removed
         */
        onRemove: (item) => {
            for (let i = 0; i < config.columns.length; i++) {
                if (config.columns[i].label === item.label) {
                    config.columns.splice(i, 1);
                    break;
                }
            }
        },

        /**
         * Gets called when the given item was added
         */
        onAdd: (item) => {
            config.columns.push(item);
            if (config.layout && config.layout.primary) {
                config.layout["primary"].push({
                    width: 100,
                    column: item.column,
                    type: item.type,
                });
            }
        },
    });
}

/**
 * Synchronizes the layout columns with the actual set of columns to ensure that it only has real columns,
 * and the filters are bounded appropriately
 */
export function syncLayoutColumns(layoutCols: ITableSorterLayoutColumn[], newCols: ITableSorterColumn[], oldCols: ITableSorterColumn[]) {
    "use strict";
    newCols = newCols || [];
    oldCols = oldCols || [];
    layoutCols = layoutCols || [];
    let columnFilter = (c: ITableSorterLayoutColumn) => {
        // If this column exists in the new sets of columns, pass the filter
        const newCol = newCols.filter(m => m.column === c.column)[0];
        let result = !!newCol;
        if (newCol) {

            // Bound the filted domain to the actual domain (in case they set a bad filter)
            let oldCol = oldCols.filter(m => m.column === c.column)[0];
            if (c.domain) {
                // It is filtered if the "filter" domain is different than the actual domain
                const isFiltered =
                    isValidDomain(c.domain) && isValidDomain(oldCol.domain) &&
                    (c.domain[0] !== oldCol.domain[0] || c.domain[1] !== oldCol.domain[1]);
                let lowerBound = newCol.domain[0];
                let upperBound = newCol.domain[1];

                // If it was filtered before, then copy over the filter, but bound it to the new domain
                if (isFiltered) {
                    lowerBound = Math.max(newCol.domain[0], c.domain[0]);
                    upperBound = Math.min(newCol.domain[1], c.domain[1]);
                }

                c.domain = [lowerBound, upperBound];
            }
        }

        if (c.children) {
            c.children = c.children.filter(columnFilter);
            return c.children.length > 0;
        }

        return result;
    };

    return layoutCols.filter(columnFilter);
}

/**
 * Returns true if the given domain is valid
 */
function isValidDomain(domain: number[]) {
    "use strict";
    return domain && domain.length === 2 && domain[0] !== null && domain[0] !== undefined && domain[1] !== null && domain[1] !== undefined; // tslint:disable-line
}

/**
 * Calculates the domain of the given column
 */
export function calcDomain (data: any[], name: string) {
    "use strict";
    let min: number;
    let max: number;
    data.forEach(m => {
        const val = m[name];
        if (val !== null && val !== undefined) { // tslint:disable-line
            if (typeof min === "undefined" || val < min) {
                min = val;
            }
            if (typeof max === "undefined" || val > max) {
                max = val;
            }
        }
    });
    return [min || 0, max || 0];
};
