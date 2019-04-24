/*
    Interface: these functions are called in response to button clicks and other user input
*/

        /*
            updateFields: some dropdown menus are used to select an entry from a given table.
            This function is to be called whenever the user modifies a table (eg. saves a new framework)
            to ensure the list in each dropdown menu is up to date
            -currently only needed for frameworks

            called from other functions in this file
        */
        Relation.prototype.updateFields = function(element) {
            let self = this;
            let $element = element ? $(element) : $(document);
            // a select is a dropdown menu, and those with a 'select-table={table}' attribute are for
            // selecting an entry from {table}
            $element.find('select[select-table]').each(function() {
                let $this = $(this), table = $this.attr('select-table');
                // remove all items from the dropdown except the first dummy item which says ' -- Select -- '
                $this.children().first().nextAll().remove();
                // the updated list of records from that table is now in memory, so sort it by name...
                let entries = self.getTable(table), sorted = [];
                for(let id in entries) {
                    if(id < 0) continue; // a negative ID means we haven't saved that entry to the DB yet
                    let i = 0, name = entries[id].name;
                    // find the place in the list where this entry goes (i)
                    while(i < sorted.length && name.localeCompare(entries[sorted[i]].name) > 0) i++;
                    // and put it there
                    sorted.splice(i, 0, id);
                }
                // append the sorted entries to the now-empty dropdown menu
                sorted.forEach(function(id) {
                    $this.append('<option value="' + id + '">' + entries[id].name + '</select>');
                });
            });
        };


        /*
            setPredicate: called from /views/default/knowledge.html when a user selects frop the 'set-predicate'
            dropdown menu.  They can either choose one of the existing predicate sets of the current law,
            or 'New Predicate', in which case a new predicate set is created.
        */
        Relation.prototype.setPredicate = function(predicate) {
            let self = this;
            // first un-highlight any selected predicate nodes
            self.diagram.nodes.each(function(node) {
                self.setNodeTemplate(node.data, 'default');
            });

            // if they clicked the ' - SELECT - ' option, then no predicate set is selected,
            // so hide the control buttons and return
            if(predicate < 0) {
                $('#remove-predicate, #predicate-help').hide();
                return;
            }

            // create a new empty predicate set if requested
            if(predicate == 'new') {
                predicate = self.predicateSets.length;
                self.predicateSets.push({});
                let $select = $('#set-predicate');
                $select.find('[value="new"]').before('<option value="' + predicate + '">Predicate ' + (predicate+1) + '</option>');
                $select.val(predicate);
            }

            // show the button to remove the selected predicate
            $('#remove-predicate, #predicate-help').show();

            // now highlight nodes that are part of the chosen predicate
            for(let node in self.predicateSets[predicate]) {
                self.setNodeTemplate(node, 'predicate');
            }
            self.currentPredicate = predicate;
        };


        /*
            removePredicate: called from /views/default/knowledge.html when there is a predicate set currently selected
            and the user clicks the 'Remove' button to remove it from the law (the nodes in the set are not removed)
        */
        Relation.prototype.removePredicate = function(predicate) {
            let self = this;
            if(predicate === undefined) predicate = self.currentPredicate;
            if(isNaN(predicate)) return false;
            // there is now no predicate set selected, so set the dropdown back to the 'SELECT' option
            if(self.currentPredicate == predicate) {
                self.setPredicate(-1);
                $('#set-predicate').val(0);
            }
            // remove the set from the current law's list of predicate sets
            self.predicateSets.splice(predicate, 1);
            // the index of sets after this one in the list has now decreased by 1 - those are
            // used as the values in the dropdown menu so they must be updated
            let $option = $('#set-predicate > option[value="' + predicate + '"]').val("");
            $option.nextAll().each(function(i, el) {
                el.value = parseInt(el.value) - 1;
                el.text = 'Predicate ' + el.value;
            });
            // remove the dropdown option for the removed set
            $option.remove();
        };


        /*
            togglePredicate: called from diagram.js when a user right-clicks a node in the diagram and
            chooses 'Add to Predicate/Remove from Predicate' from the context menu.
        */
        Relation.prototype.togglePredicate = function(node, include) {
            let self = this;
            // make sure there is a currently selected predicate set
            if(!self.predicateSets.hasOwnProperty(self.currentPredicate)) return false;
            // add or remove the clicked node from that predicate set
            if(include) {
                self.predicateSets[self.currentPredicate][node] = true;
                self.setNodeTemplate(node, 'predicate');
            } else {
                delete self.predicateSets[self.currentPredicate][node];
                self.setNodeTemplate(node, 'default');
            }
        };


        /*
            inPredicate: return true if the given node is in the currently selected predicate set,
            false otherwise - called from diagram.js
        */
        Relation.prototype.inPredicate = function(node) {
            let self = this;
            if(isNaN(node)) return false;
            return self.predicateSets.hasOwnProperty(self.currentPredicate)
                && self.predicateSets[self.currentPredicate].hasOwnProperty(node);
        };


        /*
            useFramework: called from knowledge.html when a user selects a new framework with the
            'Select Framework' button.  Loads the framework from the server if it isn't yet, and
            updates the page to reflect it - changes the framework display name, puts the appropriate
            concepts in the palette, and changes dropdown menus to include the new framework and its dependencies

            lawId can optionally be specified to load the given law into the diagram once the framework
            is done loading (so lawId should be a law within the specified framework)
        */
        Relation.prototype.useFramework = function(id, lawId) {
            let self = this, framework = this.frameworks[id];

            // make the AJAX call to the server to load the framework if it isn't yet
            if(!framework || !framework.loaded) {
                $.ajax({
                    url: self.loadFrameworkURL, //defined in knowledge.html - calls the 'loadFramework' function of /controllers/default.py
                    type: 'get',
                    dataType: 'json',
                    data: {
                        framework: id
                    },
                    success: function(data) {
                        // the server passes back the framework record with its concepts and laws, so store these in memory
                        self.storeEntries(data);
                        // update the dropdowns, display name, and concept palette with the new framework
                        self.setFramework(id);
                        self.setPaletteModel();
                        self.filterPalette();
                        self.updateFields();
                        // load the law into the diagram if specified
                        if(lawId) {
                            self.useLaw(lawId);
                        }
                    }
                });
            // if the chosen framework was previously loaded, skip the server call and just update the page
            } else {
                self.setFramework(id);
                self.setPaletteModel();
                self.filterPalette();
            }
        };


        /*
            setFramework: when the user selects a new framework,
            update the framework display name and the frameworks listed in the filter dropdown menus
        */
        Relation.prototype.setFramework = function(frameworkId) {
            let self = this;
            if(isNaN(frameworkId)) return;
            // get the framework entry with the specified id
            let framework = self.findEntry('framework', frameworkId);

            // if there is none, but we haven't yet loaded any frameworks, then the current framework record is a dummy,
            // so just set its ID to the given one for the moment - the whole record will be updated when it is passed
            // back from the server
            if(!framework) {
                if(self.framework && self.framework.id == -1) {
                    self.framework.id = frameworkId;
                    framework = self.framework;
                } else return;
            }
            self.framework = framework;

            // set the displayed name of the current framework to the newly selected one
            $('.entry-wrapper[table=framework] .entry-name').text(self.framework.name || 'None');

            // create a list of the new framework and all its dependencies (including their dependencies recursively)
            let options = [];
            if(self.framework.id > 0) options.push(self.framework.id);
            for(let i = 0; i < options.length; i++) {
                let fw = options[i], framework = self.frameworks[fw];
                if(framework) for(let dep in framework.dependencies) {
                    if(options.indexOf(dep) < 0) options.push(dep);
                }
            }

            // put that list in the framework filter dropdown menus (in the modals for selecting/creating concepts and laws,
            // and by the concept palette next to the diagram
            let $filters = $('.framework-filter');
            $filters.each(function() {
                $(this).children().first().nextAll().remove();
            });
            options.forEach(function(option) {
                let framework = self.frameworks[option], name = framework ? framework.name || 'Loading...' : 'Loading...';
                el = '<option value="' + option + '">' + name + '</option>';
                $filters.append(el);
            });
            //in each filter, the selected option should be the newly selected framework
            $filters.val(self.framework.id);
        };


        /*
            useLaw: called from knowledge.html when the user selects a new law via the 'Select Law' button.
            We switch to the framework of the selected law, update the display names of both framework and law,
            update menus and the concept palette for the framework, and draw the tree of the law in the diagram canvas.
        */
        Relation.prototype.useLaw = function(id) {
            let self = this;
            if(self.law.id == id) return;
            self.setLaw(id);
            if(self.law.framework != self.framework.id)
                self.useFramework(self.law.framework);
            // draw the law tree in the diagram canvas
            self.draw(); // defined in diagram.js
        };


        /*
            setLaw: change the current law to the entry with the given ID and update the law display name
        */
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


        /*
            save: save the law tree (ie. all the nodes and the predicate sets) to the database
        */
        Relation.prototype.save = function() {
            let self = this, id = self.law.id;
            let nodes = [], predicates = [];

            // make sure any changes to the nodes in the diagram are reflected in our list of nodes in memory
            // eg. create new node entries, delete/edit ones that the user has removed or modified, etc.
            self.syncGraph(); // defined in diagram.js

            // convert our lists of nodes and predicates for the current law to the format the server
            // expects to receive
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

            // perform the AJAX call to save the law
            $.ajax({
                url: self.saveRelationURL, // defined in knowledge.html - calls the 'saveRelation' function of /controllers/default.py
                type: 'post',
                dataType: 'json',
                data: JSON.stringify({id: id, framework: self.framework.id, nodes: nodes, predicates: predicates}),
                success: function(data) {
                    // syncGraph should already have updated our local node list appropriately,
                    // but just make double sure it reflects the SQL database by storing what the server passed back
                    self.storeEntries(data);
                    $('#law-save-msg').val('Relation saved').show(3000);
                },
                error: function() {
                }
            });
        };


        /*
            selectEntry: pops up the modal for the specified table with the 'Select' tab activated,
            where the user can enter search text to find the desired entry.  The 'New' tab is also
            available, where they can create a new entry in that table.

            For an explanation of 'opts', see 'showEntryModal' below

            called from knowledge.html upon clicking 'Select Framework' or 'Select Law'
        */
        Relation.prototype.selectEntry = function(table, opts) {
            let self = this;
            if(!opts) opts = {};
            if(typeof opts === 'function') opts = { callback: opts };
            opts.tab = opts.tab || 'search'; // if not specified, enable the 'Select' tab
            opts.enabledTabs = ['create', 'search']; //make both the 'Select' and 'New' tabs available
            self.showEntryModal(table, opts);
        };


        /*
            newEntry: pops up the modal to create a new entry in the given table.
            Currently only called from knowledge.html when the user clicks the 'New Concept' button by the
            concept palette, but could be used for any table.

            For an explanation of 'opts', see 'showEntryModal' below
        */
        Relation.prototype.newEntry = function(table, opts) {
            let self = this;
            if(!opts) opts = {};
            if(typeof opts === 'function') opts = { callback: opts };
            opts.tab = 'create';
            self.showEntryModal(table, opts);
        };


        /*
            editEntry: pops up the modal to edit the given entry in the given table.
            'entry' can be an ID number, the name of the entry, or the actual entry record.
            Currently called from knowledge.html when the user clicks the 'Edit' button
            next to the current framework or current law.  Also from diagram.js when the user
            right-clicks a concept in the concept palette, or a node in the diagram, and
            chooses 'Edit Concept' from the context menu.

            For an explanation of 'opts', see 'showEntryModal' below
        */
        Relation.prototype.editEntry = function(table, entry, opts) {
            let self = this;
            if(!opts) opts = {};
            if(typeof opts === 'function') opts = { callback: opts };
            opts.entry = entry;
            opts.tab = 'edit';
            self.showEntryModal(table, opts);
        };


        /*
            duplicateEntry: pop up the modal to create a new entry for the given table, but
            with the form fields auto-filled with the information of the given 'entry' which
            can be an ID, name, or entry record.

            For an explanation of 'opts', see 'showEntryModal' below
        */
        Relation.prototype.duplicateEntry = function(table, entry, opts) {
            let self = this;
            if(!opts) opts = {};
            if(typeof opts === 'function') opts = { callback: opts };
            opts.entry = entry;
            opts.tab = 'create';
            self.showEntryModal(table, opts);
        };


        /*
            showEntryModal: pop up the modal for the given table with the specified options in 'opts'.
            opts is an object whose keys can include:
                'callback': set to the function that should be called when the modal is closed via any button.
                'enabledTabs': an array including one or more of: 'create', to allow the user to create a new record
                    via the 'New' tab; 'edit', allowing them to edit a record; and 'search' to allow them to find and
                    select a record.  For example, ['create', 'search']
                'tab': the default tab that should be shown when the modal is popped up.
                'entry': an ID, name, or full record of an entry whose information should be populated in the form.
                    If editing, this information goes in the 'edit' form, if duplicating it goes in the 'create' form.
                'fields': an object of field-value pairs to be populated in the form, if a full entry is not given.
                    For example, {name: 'Bob', description: 'a cat'}

            opts can also just be a function, in which case that function will be treated as the 'callback'.

            Used by the above functions to allow the user to create/edit/duplicate/select entries from the page.
        */
        Relation.prototype.showEntryModal = function(table, opts) {
            let self = this, $modal = $('#' + table + '-modal');
            if(!opts) opts = {};

            // if opts is just a function, treat that as the callback when the modal is closed
            if(typeof opts === 'function') opts = { callback: opts };

            // figure out which tabs are to be available to the user and which is shown by default
            let showSearch = false;
            // first hide all tabs
            $modal.find('.entry-tab').hide();
            // then loop through all the tabs in the modal
            $modal.find('.entry-tab').each(function() {
                // the structure of the tabs in the modal is defined in /views/default/entry.load
                let $this = $(this), $link = $this.children('.nav-link'),
                    tabName = $link.attr('id').split('-')[1];
                // enable the tab if the options have specified that it is available
                if((Array.isArray(opts.enabledTabs) && opts.enabledTabs.indexOf(tabName) >= 0) || opts.tab === tabName) {
                    $this.show();
                    if(opts.tab === tabName) $link.tab('show');
                    // if the search tab is to be shown first, we will start by showing the list of all records from this table
                    if(tabName === 'search') showSearch = true;
                }
            });


            // by default, set the framework filter of each tab to the current framework
            $modal.find('.framework-filter').val(self.framework.id);

            // if either the 'create' or 'edit' form is being shown, and there is an 'entry' or 'fields'
            // option specified, pre-populate the form with the given entry record or specific fields
            $modal.find('.entry-form').each(function() {
                let $form = $(this), type = $form.attr('id').split('-')[1];
                // ignore forms whose tabs are being hidden
                if(opts.enabledTabs && opts.enabledTabs.indexOf(type) < 0) return;

                let entry = opts.entry;
                // if an entry was given as an ID or name, retrieve its actual record
                if(entry && typeof entry !== 'object') {
                    entry = self.findEntry(table, opts.entry);
                }
                // pre-populate the form with the entry's information
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
                // if no entry was provided, clear the form
                } else {
                    $form.trigger('reset');
                    $form.find('.framework-filter').val(self.framework.id);
                }

                // the 'table' input in the form is not part of the entry, but lets the server know which
                // database table to update
                $form.find('[name="table"]').val(table);

                // if specific field-value pairs were given instead of an entry, populate those
                if(typeof opts.fields === 'object') {
                    for(let name in opts.fields) {
                        // get the value provided for the field
                        let value = opts.fields[name];
                        // find the corresponding element in the form
                        let $el = $form.find('[name="' + name + '"]');
                        if($el.length < 1) continue;

                        let $multiple = $el.parents('.multiple-wrapper');

                        // populate the field in the form depending on what type of field it is

                        if($el.is('input[type=checkbox]')) $el.attr('checked', value ? true : false);
                        // for a list-type field, the value should be an array, and for each element in the array
                        // we add a row to the list
                        else if($multiple.length > 0 && Array.isArray(value)) {
                            $multiple.find('.multiple-item').first().nextAll('.multiple-item').remove();
                            value.forEach(function(row) {
                                self.addMultipleField($multiple, row); //defined below in this file
                            });
                        } else $el.val(value);
                    }
                }
            });

            // see above - if we are starting on the 'search' tab, show all records from this table,
            // and let the user enter search text to narrow down the list
            if(showSearch) self.showSearchResults(table, '');

            // store the callback function (if any) in the modal object so we can retrieve and call it when the modal is closed
            $modal.data('callback', opts.callback);

            // pop up the modal
            $modal.modal('show');
        };


        /*
            onModalHide: called from knowledge.html whenever a modal is hidden.  This happens when the user clicks 'Select'
            to select an entry, or 'Save Changes' to save a new entry or edit an existing one, or if they click 'Cancel'.
            In knowledge.html the last-clicked button is kept track of, and that is passed to this function as '$hideButton'
            so we know which button was used to close the modal, and therefore what action to take.
        */
        Relation.prototype.onModalHide = function($modal, $hideButton) {
            let self = this;

            // if no button click was registered then we can just assume the active element is the button that was clicked
            let $button = $hideButton || $(document.activeElement);
            // the custom callback function, if any, was stored in this modal in 'showEntryModal' above - now it is to be called
            let callback = $modal.data('callback');
            // each modal has an 'id' of the form {table}-modal
            let prefix = $modal.attr('id'), prefixArr = prefix.split('-'), table = prefixArr[0], type = prefixArr[1];
            console.log('modal ' + $modal.attr('id') + ' hidden');

            // if the modal was hidden via the 'Cancel' button, we don't have to do anything
            if($button.hasClass('modal-cancel')) {
                return;

            // if 'Select', we just chose an entry, so perform the specified callback with the ID of that entry
            } else if($button.hasClass('modal-select')) {
                let id = $('#' + table + '-selected-id').val();
                if(!id) return;
                if(callback) callback.call(self, id);

            // if 'Save', that means the user just filled out the 'create' or 'edit' form, so we take what they entered,
            // convert it to the format that will be saved in the database by the server, and pass it to the server
            } else if($button.hasClass('modal-save')) {
                let $tab = $button.parents('.tab-pane'), $form = $tab.find('form.entry-form'),
                arr = $form.serializeArray(), obj = {};

                for(let i = 0; i < arr.length; i++) obj[arr[i]['name']] = arr[i]['value'];

                //convert any multiple fields to proper format
                $form.find('.multiple-template').each(function() {
                    // the .multiple-template is the hidden dummy row that gets copied each time the user adds a row;
                    // the template's field names are given an incremented numeric suffix in each added row.
                    let $this = $(this), $fields = $this.find('[name]');
                    // loop through each field in the template that has a 'name' attribute
                    $fields.each(function() {
                        let name = $(this).attr('name');
                        obj[name] = {};
                        // now find each field in the form that has the same name but with a suffix
                        for(let key in obj) if(key.startsWith(name + '_')) {
                            // lump all the suffixed fields with the template field so the server knows they are
                            // a single list item
                            obj[name][obj[key]] = true;
                            delete obj[key];
                        }
                    });
                });

                if(table == 'framework') {
                    for(let dep in obj.dependencies) {
                        let framework = self.findEntry('framework', dep);
                        // if we're saving a framework, that means we may have changed its dependency frameworks;
                        // so flag the dependencies that have not yet been loaded so the server can pass them along
                        obj.dependencies[dep] = framework && !framework.loaded; //use a boolean value to say whether it needs to be loaded
                    }
                } else if(table == 'concept') {
                    // convert the data commands for a concept to the form they will be stored in the database
                    obj.commands = (obj.commands || '').replace(/\n/g, '<DELIM>');
                }

                console.log('saving entry');
                console.info(obj);

                // finally, pass the entry data to the server to be saved in the database
                $.ajax({
                    url: Relation.prototype.saveEntryURL, // defined in knowledge.html
                    type: 'post',
                    dataType: 'json',
                    data: JSON.stringify(obj),
                    success: function(data) {
                        if(data.hasOwnProperty('id') && !isNaN(data.id)) {
                            // once we know the database has been updated, we must update our local copy of that entry in memory
                            self.storeEntries(data); // defined in databaseWrappers.js
                            // also we call the custom callback, if any was specified, on the newly saved entry
                            if(callback) callback.call(self, data.id);
                        }
                    }
                });
            }
        };


        /*
            addMultipleField: add a row to a list item, with the specified values for all elements in that row.
            $element should be the '.multiple-wrapper' div (see /views/default/create_edit.load for the mutiple item structure)
            and 'values' is an object with name-value pairs for each element in the row that has a 'name' attribute.
        */
        Relation.prototype.addMultipleField = function($element, values) {
            // the .multiple-template is the dummy row that gets copied each time
            let self = this, $template = $element.find('.multiple-template');
            // add a new copy of the template
            let $entry = $template.clone().removeClass('multiple-template');
            // if the row has any entry-selector dropdowns, update their list of choices (for example, a concept can be an
            // instance of multiple other concepts, so it has a multiple item where each row has a dropdown to select the parent concept)
            self.updateFields($entry);
            //update the index, and values if given, on all sub-elements that have names for form submission
            $element.find('.multiple-item').last().after($entry);
            let index = $entry.index();
            $entry.find('[name]').each(function() {
                let $this = $(this), name = $this.attr('name');
                $this.attr('name', name + '_' + index);
                if(typeof values == 'object' && values.hasOwnProperty(name)) $this.val(values[name]);
            });
            //add listener to the REMOVE button in case the user decides to remove this row later
            let $required = $entry.find('.multiple-required'), $removeButton = $entry.find('.multiple-remove');
            $removeButton.click(function(e) {
                if($(this).hasClass('disabled')) return;
                $entry.remove();
            });
        };


        /*
            showSearchResults: in the 'search' tab of a modal, show the list of all records whose name
            contains the specified search text.  This text will be empty (no filtering) when the modal is first shown,
            and the function is called again whenever the user edits the search text.  Called elsewhere in this file.
        */
        Relation.prototype.showSearchResults = function(table, text) {
            let self = this;

            // get the local copy of all records for the specified table
            let entries = self.getTable(table), results = [];
            if(!entries) return;

            let $tab = $('#' + table + '-search-tab-content'), $results = $tab.find('#' + table + '-results'),
                $framework = $tab.find('.framework-filter');
            // see if the user has selected a framework in the framework filter field above the search text;
            // if so, limit results to that framework as well
            let framework = $framework.val();

            // loop through the entries in the table and see which match the framework/text filters
            for(let id in entries) {
                let entry = entries[id];
                if(framework > 0 && entry.framework != framework) continue;
                if(entry.hasOwnProperty('name')) {
                    let name = entry.name.toLowerCase();
                    // if the entry name contains the search text, create an result div to display it and append it to the results array
                    if(name.indexOf(text) >= 0) {
                        let result =
                            '<div id="' + table + '-result-' + id + '" class="result-display">' +
                            '<span class="result-name">' + entry.name + '</span>';
                        if(entry.hasOwnProperty('description'))
                            result += '<span class="result-description">' + entry.description + '</span>';
                        result += '</div>';
                        let $result = $(result);

                        // when the user clicks this div, it means they are selecting that entry. We then update the
                        // 'selected-id' field of the modal, so when the modal is closed via the 'Select' button,
                        // we know which record was highlighted.
                        $result.click(function(e) {
                            $('#' + table + '-selected-id').val(id);
                            $results.children().removeClass('selected');
                            // the CSS specifies a highlight for an entry with the .selected class
                            $(this).addClass('selected');
                        });
                        results.push($result);
                    }
                }
            }
            // clear the results display section and fill it with the newly found entries
            $results.empty();
            results.forEach(function($res) { $results.append($res); });
        };
