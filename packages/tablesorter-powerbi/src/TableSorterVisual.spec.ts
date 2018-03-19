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
require("./spec/init"); // tslint:disable-line

import { Utils as SpecUtils } from "@essex/visual-testing-tools";
import { UpdateType } from "@essex/visual-utils";
import { expect } from "chai";
import { default as TableSorterVisual  } from "./TableSorterVisual";
import { Promise } from "es6-promise";

describe("TableSorterVisual", () => {
    let parentEle: JQuery;
    beforeEach(() => {
        parentEle = $("<div></div>");
    });

    afterEach(() => {
        if (parentEle) {
            parentEle.remove();
        }
        parentEle = undefined;
    });

    let createVisual = () => {
        let options = SpecUtils.createFakeConstructorOptions();
        let instance: TableSorterVisual = new TableSorterVisual(options, {
            presentation: {
                animation: false,
            },
        }, null, 3);
        parentEle.append(options.element);

        return {
            instance,
            element: $(options.element)
        };
    };

    const smallUpdateOptions = () => {
        const baseOptions = SpecUtils.createUpdateOptionsWithSmallData();
        const cols = baseOptions.dataViews[0].table.columns;
        cols.forEach(n => {
            n.queryName = n.displayName;
            n.roles = {};
        });
        baseOptions.dataViews[0].metadata.columns = cols.slice(0);
        return baseOptions;
    };

    const basicOptions = () => {
        const baseOptions = SpecUtils.createUpdateOptionsWithData();
        const cols = baseOptions.dataViews[0].table.columns;
        cols.forEach(n => {
            n.queryName = n.displayName;
            n.roles = {};
        });
        baseOptions.dataViews[0].metadata.columns = cols.slice(0);
        return baseOptions;
    };

    it("should load", () => {
        expect(createVisual()).to.not.be.undefined;
    });

    it("should remove columns from TableSorter.configuration if columns are removed from PBI", () => {
        let { instance } = createVisual();

        // Load initial data
        instance.update(basicOptions(), undefined, UpdateType.Data);
        expect(instance.tableSorter.configuration.columns.length).to.be.equal(2);

        // Pretend that we had an existing config
        let config = instance.tableSorter.configuration;
        let newOptions = smallUpdateOptions();
        newOptions.dataViews[0].metadata = <any>{
            objects: {
                "layout": {
                    "layout": JSON.stringify(config),
                },
            },
        };

        // Run update again with new options
        instance.update(newOptions, undefined, UpdateType.Data);

        // Make sure it removed the extra column
        expect(instance.tableSorter.configuration.columns.length).to.be.equal(1);
    });

    it("should load the data into the tablesorter if only columns changed", () => {
        let { instance } = createVisual();

        // Load initial data
        instance.update(basicOptions(), undefined, UpdateType.Data);
        expect(instance.tableSorter.configuration.columns.length).to.be.equal(2);

        instance.tableSorter = <any>{};
        instance.update(smallUpdateOptions(), undefined, UpdateType.Data);

        // TODO: Assume the data is legit for now
        expect(instance.tableSorter.dataProvider).to.not.be.undefined;
    });

    it("should remove sort from TableSorter.configuration if columns are removed from PBI", () => {
        let { instance } = createVisual();

        // Load initial data
        let data = basicOptions();
        instance.update(data, undefined, UpdateType.Data);
        expect(instance.tableSorter.configuration.columns.length).to.be.equal(2);

        // Pretend that we had an existing config
        let newOptions = smallUpdateOptions();
        let config = instance.tableSorter.configuration;

        // Add a sort to the missing data, which in this case is the second column in the original data
        config.sort = {
            // This column is removed in the "Small" dataset
            column: data.dataViews[0].table.columns[1].displayName,
            asc: true,
        };

        newOptions.dataViews[0].metadata = <any>{
            objects: {
                "layout": {
                    "layout": JSON.stringify(config),
                },
            },
        };

        // Run update again with new options
        instance.update(newOptions, undefined, UpdateType.Data);

        // Make sure it removed the extra column
        expect(instance.tableSorter.configuration.sort).to.be.undefined;
    });

    it("should load tableSorter with a new provider when new data is passed via PBI", () => {
        let { instance } = createVisual();
        let fakeProvider = {
            canQuery: () => Promise.resolve(false),
        } as any;

        // HACK, we should make it "protected"
        instance["createDataProvider"] = <any>(() => fakeProvider);

        // Load initial data
        let data = basicOptions();
        instance.update(data, undefined, UpdateType.Data);

        expect(instance.tableSorter.dataProvider).to.be.equal(fakeProvider); // Make sure it sets my data provider
    });

    it("should load tableSorter with the correct layout stored in PBI", () => {
        let { instance } = createVisual();
        let fakeProvider = {
            canQuery: () => Promise.resolve(false),
        } as any;

        // HACK, we should make it "protected"
        instance["createDataProvider"] = <any>(() => fakeProvider);

        // Load initial data
        const data = basicOptions();
        instance.update(data, undefined, UpdateType.Data);

        // Tweak the layout of the table
        const config = instance.tableSorter.configuration;
        const newLayout = {
            primary: [{
                column: "COLUMN_2",
            }, {
                column: "COLUMN_1",
            }, {
                column: "COLUMN_1",
            }],
        };
        data.dataViews[0].metadata = <any>{
            objects: {
                "layout": {
                    "layout": JSON.stringify($.extend(true, {}, config, {
                        "layout": newLayout,
                     })),
                },
            },
        };

        // Update TableSorterVisual with the new layout
        instance.update(data, undefined, UpdateType.Settings);

        // Make sure the layouts order matches
        expect(instance.tableSorter.configuration.layout.primary.map(n => n.column))
            .to.be.deep.equal(newLayout.primary.map(n => n.column));
    });
});
