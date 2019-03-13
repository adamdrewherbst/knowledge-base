        Relation.prototype.updateFields = function(element) {
            let self = this;
            let $element = element ? $(element) : $(document);
            $element.find('select[select-table]').each(function() {
                let $this = $(this), table = $this.attr('select-table');
                $this.children().first().nextAll().remove();
                let entries = self.getTable(table), sorted = [];
                for(let id in entries) {
                    if(id < 0) continue;
                    let i = 0, name = entries[id].name;
                    while(i < sorted.length && name.localeCompare(entries[sorted[i]].name) > 0) i++;
                    sorted.splice(i, 0, id);
                }
                sorted.forEach(function(id) {
                    $this.append('<option value="' + id + '">' + entries[id].name + '</select>');
                });
            });
        };


        Relation.prototype.setPredicate = function(predicate) {
            let self = this;
            //first un-highlight any selected predicate nodes
            self.diagram.nodes.each(function(node) {
                self.setNodeTemplate(node.data, 'default');
            });

            if(predicate < 0) {
                $('#remove-predicate, #predicate-help').hide();
                return;
            }

            //create a new empty predicate set if requested
            if(predicate == 'new') {
                predicate = self.predicateSets.length;
                self.predicateSets.push({});
                let $select = $('#set-predicate');
                $select.find('[value="new"]').before('<option value="' + predicate + '">Predicate ' + (predicate+1) + '</option>');
                $select.val(predicate);
            }

            $('#remove-predicate, #predicate-help').show();

            //now highlight nodes that are part of the chosen predicate
            for(let node in self.predicateSets[predicate]) {
                self.setNodeTemplate(node, 'predicate');
            }
            self.currentPredicate = predicate;
        };


        Relation.prototype.removePredicate = function(predicate) {
            let self = this;
            if(predicate === undefined) predicate = self.currentPredicate;
            if(isNaN(predicate)) return false;
            if(self.currentPredicate == predicate) {
                self.setPredicate(-1);
                $('#set-predicate').val(0);
            }
            self.predicateSets.splice(predicate, 1);
            let $option = $('#set-predicate > option[value="' + predicate + '"]').val("");
            $option.nextAll().each(function(i, el) {
                el.value = parseInt(el.value) - 1;
                el.text = 'Predicate ' + el.value;
            });
            $option.remove();
        };


        Relation.prototype.togglePredicate = function(node, include) {
            let self = this;
            if(!self.predicateSets.hasOwnProperty(self.currentPredicate)) return false;
            if(include) {
                self.predicateSets[self.currentPredicate][node] = true;
                self.setNodeTemplate(node, 'predicate');
            } else {
                delete self.predicateSets[self.currentPredicate][node];
                self.setNodeTemplate(node, 'default');
            }
        };


        Relation.prototype.inPredicate = function(node) {
            let self = this;
            if(isNaN(node)) return false;
            return self.predicateSets.hasOwnProperty(self.currentPredicate)
                && self.predicateSets[self.currentPredicate].hasOwnProperty(node);
        };


        Relation.prototype.useFramework = function(id, lawId) {
            let self = this, framework = this.frameworks[id];

            if(!framework || !framework.loaded) {
                $.ajax({
                    url: self.loadFrameworkURL,
                    type: 'get',
                    dataType: 'json',
                    data: {
                        framework: id
                    },
                    success: function(data) {
                        self.storeEntries(data);
                        self.setFramework(id);
                        self.setPaletteModel();
                        self.filterPalette();
                        self.updateFields();
                        if(lawId) {
                            self.useLaw(lawId);
                        }
                    }
                });
            } else {
                self.setFramework(id);
                self.setPaletteModel();
                self.filterPalette();
            }
        };


        Relation.prototype.setFramework = function(frameworkId) {
            let self = this;
            if(isNaN(frameworkId)) return;
            let framework = self.findEntry('framework', frameworkId);
            if(!framework) {
                if(self.framework && self.framework.id == -1) {
                    self.framework.id = frameworkId;
                    framework = self.framework;
                } else return;
            }
            self.framework = framework;
            $('.entry-wrapper[table=framework] .entry-name').text(self.framework.name || 'None');

            let $filters = $('.framework-filter');
            let options = [];
            if(self.framework.id > 0) options.push(self.framework.id);
            for(let i = 0; i < options.length; i++) {
                let fw = options[i], framework = self.frameworks[fw];
                if(framework) for(let dep in framework.dependencies) {
                    if(options.indexOf(dep) < 0) options.push(dep);
                }
            }
            $filters.each(function() {
                $(this).children().first().nextAll().remove();
            });
            options.forEach(function(option) {
                let framework = self.frameworks[option], name = framework ? framework.name || 'Loading...' : 'Loading...';
                el = '<option value="' + option + '">' + name + '</option>';
                $filters.append(el);
            });
            $filters.val(self.framework.id);
        };


        Relation.prototype.useLaw = function(id) {
            let self = this;
            if(self.law.id == id) return;
            self.setLaw(id);
            if(self.law.framework != self.framework.id)
                self.useFramework(self.law.framework);
            self.draw();
        };


        Relation.prototype.setLaw = function(lawId) {
            let self = this;
            if(isNaN(lawId)) return;
            let law = self.findEntry('law', lawId);
            if(!law) {
                if(self.law && self.law.id == -1) {
                    self.law.id = lawId;
                    law = self.law;
                } else return;
            }
            self.law = law;
            $('.entry-wrapper[table=law] .entry-name').text(self.law.name || 'None');
        };


        Relation.prototype.save = function() {
            let self = this, id = self.law.id;

            let nodes = [], predicates = [];
            self.syncGraph();
            self.law.nodes.forEach(function(id) {
                let node = self.findEntry('node', id);
                if(node) nodes.push({id: node.id, concept: node.concept, name: node.name, head: node.head,
                    reference: node.reference, value: node.value.writeValue()});
            });
            self.predicateSets.forEach(function(pset, i) {
                for(let node in pset) {
                    predicates.push({'node': parseInt(node), 'predicate_group': i+1});
                }
            });

            $.ajax({
                url: self.saveRelationURL,
                type: 'post',
                dataType: 'json',
                data: JSON.stringify({id: id, framework: self.framework.id, nodes: nodes, predicates: predicates}),
                success: function(data) {
                    self.storeEntries(data);
                    $('#law-save-msg').val('Relation saved').show(3000);
                },
                error: function() {
                }
            });
        };


        Relation.prototype.selectEntry = function(table, opts) {
            let self = this;
            if(!opts) opts = {};
            if(typeof opts === 'function') opts = { callback: opts };
            opts.tab = opts.tab || 'search';
            opts.enabledTabs = ['create', 'search'];
            self.showEntryModal(table, opts);
        };


        Relation.prototype.newEntry = function(table, opts) {
            let self = this;
            if(!opts) opts = {};
            if(typeof opts === 'function') opts = { callback: opts };
            opts.tab = 'create';
            self.showEntryModal(table, opts);
        };


        Relation.prototype.editEntry = function(table, entry, opts) {
            let self = this;
            if(!opts) opts = {};
            if(typeof opts === 'function') opts = { callback: opts };
            opts.entry = entry;
            opts.tab = 'edit';
            self.showEntryModal(table, opts);
        };


        Relation.prototype.duplicateEntry = function(table, entry, opts) {
            let self = this;
            if(!opts) opts = {};
            if(typeof opts === 'function') opts = { callback: opts };
            opts.entry = entry;
            opts.tab = 'create';
            self.showEntryModal(table, opts);
        };


        Relation.prototype.showEntryModal = function(table, opts) {
            let self = this, $modal = $('#' + table + '-modal');

            if(!opts) opts = {};
            if(typeof opts === 'function') opts = { callback: opts };

            let showSearch = false;
            $modal.find('.entry-tab').hide();
            $modal.find('.entry-tab').each(function() {
                let $this = $(this), $link = $this.children('.nav-link'),
                    tabName = $link.attr('id').split('-')[1];
                if((Array.isArray(opts.enabledTabs) && opts.enabledTabs.indexOf(tabName) >= 0) || opts.tab === tabName) {
                    $this.show();
                    if(opts.tab === tabName) $link.tab('show');
                    if(tabName === 'search') showSearch = true;
                }
            });

            $modal.find('.framework-filter').val(self.framework.id);
            $modal.find('.entry-form').each(function() {
                let $form = $(this), type = $form.attr('id').split('-')[1];
                if(opts.enabledTabs && opts.enabledTabs.indexOf(type) < 0) return;

                let entry = opts.entry;
                if(entry && typeof entry !== 'object') {
                    entry = self.findEntry(table, opts.entry);
                }
                if(entry instanceof Entry) {
                    $form.find('[name="id"]').val(entry.id);
                    $form.find('[name="name"]').val(entry.name);
                    $form.find('[name="description"]').val(entry.description);
                    $modal.find('.framework-filter').val(entry.framework);
                    if(table == 'concept') {
                        $form.find('[name=law_specific]').val(entry.law_specific || '');
                        $form.find('[name="node_specific"]').val(entry.node_specific || '');
                        $form.find('[name="symbol"]').val(entry.symbol);
                        $form.find('[name="commands"]').val(entry.commands.join("\n"));
                        $form.find('[name="head"]').val(entry.head);
                        $form.find('[name="reference"]').val(entry.reference);
                    }
                    if(table == 'framework' || table == 'concept') {
                        let $wrapper = $form.find('.multiple-wrapper');
                        $wrapper.find('.multiple-item').first().nextAll('.multiple-item').remove();
                        let depCount = 0;
                        for(let dep in entry.dependencies) {
                            self.addMultipleField($wrapper, {dependencies: dep});
                            depCount++;
                        }
                        if(depCount == 0) self.addMultipleField($wrapper);
                    }
                } else {
                    $form.trigger('reset');
                    $form.find('.framework-filter').val(self.framework.id);
                }

                $form.find('[name="table"]').val(table);

                if(typeof opts.fields === 'object') {
                    for(let name in opts.fields) {
                        let value = opts.fields[name], $el = $form.find('[name="' + name + '"]');
                        if($el.length < 1) continue;

                        let $multiple = $el.parents('.multiple-wrapper');

                        if($el.is('input[type=checkbox]')) $el.attr('checked', value ? true : false);
                        else if($multiple.length > 0 && Array.isArray(value)) {
                            $multiple.find('.multiple-item').first().nextAll('.multiple-item').remove();
                            value.forEach(function(row) {
                                self.addMultipleField($multiple, row);
                            });
                        } else $el.val(value);
                    }
                }
            });

            if(showSearch) self.showSearchResults(table, '');

            $modal.data('callback', opts.callback);
            $modal.modal('show');
        };


        Relation.prototype.addMultipleField = function($element, values) {
            let self = this, $template = $element.find('.multiple-template');
            //add a new copy of the template
            let $entry = $template.clone().removeClass('multiple-template');
            //update any input field choices according to the current data set
            self.updateFields($entry);
            //update the index, and values if given, on all sub-elements that have names for form submission
            $element.find('.multiple-item').last().after($entry);
            let index = $entry.index();
            $entry.find('[name]').each(function() {
                let $this = $(this), name = $this.attr('name');
                $this.attr('name', name + '_' + index);
                if(typeof values == 'object' && values.hasOwnProperty(name)) $this.val(values[name]);
            });
            //add listener to the REMOVE button
            let $required = $entry.find('.multiple-required'), $removeButton = $entry.find('.multiple-remove');
            $removeButton.click(function(e) {
                if($(this).hasClass('disabled')) return;
                $entry.remove();
            });
        };


        Relation.prototype.showSearchResults = function(table, text) {
            let self = this;

            let entries = self.getTable(table), results = [];
            if(!entries) return;

            let $tab = $('#' + table + '-search-tab-content'), $results = $tab.find('#' + table + '-results'),
                $framework = $tab.find('.framework-filter');
            let framework = $framework.val();

            for(let i in entries) {
                let id = i, entry = entries[id];
                if(framework > 0 && entry.framework != framework) continue;
                if(entry.hasOwnProperty('name')) {
                    let name = entry.name.toLowerCase();
                    if(name.indexOf(text) >= 0) {
                        let result =
                            '<div id="' + table + '-result-' + id + '" class="result-display">' +
                            '<span class="result-name">' + entry.name + '</span>';
                        if(entry.hasOwnProperty('description'))
                            result += '<span class="result-description">' + entry.description + '</span>';
                        result += '</div>';
                        let $result = $(result);
                        $result.click(function(e) {
                            $('#' + table + '-selected-id').val(id);
                            $results.children().removeClass('selected');
                            $(this).addClass('selected');
                        });
                        results.push($result);
                    }
                }
            }
            $results.empty();
            results.forEach(function($res) { $results.append($res); });
        };
