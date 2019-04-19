# -*- coding: utf-8 -*-
# this file is released under public domain and you can use without limitations

#
#   Adam Herbst 4/17/19
#
#   This is the file that handles requests.  ie. it initially serves the web page when someone
#   types the URL in a browser, and it responds to AJAX (real-time load/save requests)
#   triggered by the user while interacting with the page.
#
#   For a rundown of how web2py works:
#   http://web2py.com/books/default/chapter/29/03/overview#Simple-examples
#

from datetime import datetime


#   PAGES / COMPONENTS
#   The first 3 handlers serve the web page and 2 components that are part of it

#   knowledge:
#   This is the main page.
#   https://adamdrewherbst.pythonanywhere.com/welcome/default/knowledge
#
#   For the content of the page, see /views/default/knowledge.html
#
#   Since this is the 'knowledge' handler of '/controllers/default.py', and since there is
#   also a /views/default/knowledge.html file, the user can append /default/knowledge to the
#   site URL.  This handler will then be run, which can optionally process the HTTP request variables
#   stored in the 'request' object, and whatever it returns will be passed to knowledge.html to
#   render the page for the user.  You can create add a new page to the site in the same way.
#
def knowledge():
    #   There are no URL options for the main page and knowledge.html handles everything so we just
    #   return an empty Python dictionary
    return dict()


#   This is the modal (popup dialog) that lets you create/edit/select entries (frameworks, laws, concepts).
#   It is included from /views/default/knowledge.html (search that file for 'entry.load')
#   That LOAD call calls this handler which then serves the /views/default/entry.load file
#   to be included in the page.
#
def entry():
    #   this is the 'table' parameter from the LOAD call mentioned above
    table = request.vars.table
    return locals()


#   This is the form for creating/editing entries, embedded in the 'entry' popup dialog (see above)
#   it is included via a LOAD call from /views/default/entry.load.  It serves /views/default/create_edit.load
#
def create_edit():
    #   the 'table' and 'type' parameters from the LOAD call
    table = request.vars.table
    type = request.vars.type
    return locals()


#   AJAX HANDLERS & HELPER FUNCTIONS
#   The rest of the handlers are called by the JavaScript on the page, via AJAX.
#   They load and save entries.
#
#   Most of the below functions have a 'ret' variable - this holds all data that will
#   be returned to the web page (for a handler) or to the calling function (for a helper function).


#   loadFramework:
#   Pass this handler the ID of the framework you want to load,
#   and it will give you the framework entry as well as all concepts, laws,
#   and nodes within laws belonging to that framework - that way, after a user
#   loads a framework, everything in that framework is stored in memory and they
#   can browse the concepts and laws without making further calls to the server
#
#   called from interface.js
#
def loadFramework():
    frameworkId = int(request.vars.framework)
    ret = {}
    ret['entries'] = getFramework(frameworkId)
    rows = db.executesql("select `auto_increment` from information_schema.tables where table_name = 'node'")
    ret['nextNodeId'] = rows[0][0]
    #   using the response.json call puts the above 'ret' dict into JSON format which JavaScript expects
    return response.json(ret)


#   Pass this handler an entry, in JSON format, and the name of the table to save it in, and it will save it.
#   If the entry has no 'id' field, it will be inserted as a new entry.
#   Any framework/concept dependencies are included in the JSON object and the handler will store them in their appropriate tables.
#
#   called from /views/default/knowledge.html, using the fields filled out in /views/default/create_edit.load
#
def saveEntry():
    import json, urllib
    body = request.body.read()
    body = urllib.unquote(body).decode('utf8')

    #   print statements are logged to the server.log file
    #   From the PythonAnywhere page, click 'Open Web Tab', then
    #   scroll down to Log Files -> Server Log
    #
    print('{timestamp} -- saving entry').format(timestamp=datetime.utcnow().isoformat())
    print('BODY: {body}').format(body=body)

    request_vars = json.loads(body) #   parse the HTTP request body from JSON into a Python dict

    ret = {'success': False, 'entries': {}}

    #   parse which table this entry belongs to
    table = None
    if 'table' in request_vars:
        table = request_vars['table']
        #   the other request vars are the entry fields themselves (they are the form fields in create_edit.load)
        #   so once we remove 'table' we can save them directly to the database
        del request_vars['table']
    else:
        #   if we weren't told which table to save to, we can't save
        return response.json(ret)

    #   if this entry is a framework or concept, it may depend on other frameworks/concepts
    #   these dependencies are stored in separate tables (see /models/db.py)
    depTable = None
    if table == 'framework':
        depTable = 'framework_dependency'
    elif table == 'concept':
        depTable = 'concept_dependency'

    #   dependencies are included in the request, but since they are stored in separate tables,
    #   put them in a separate variable to be saved separately
    deps = {}
    if 'dependencies' in request_vars:
        deps = request_vars['dependencies']
        del request_vars['dependencies']

    #   if a record ID is provided, we update that one
    if 'id' in request_vars and request_vars['id'] is not '':
        entryId = request_vars['id']
        entry = db[table][entryId]
        if entry:
            print('UPDATING: {vars}').format(vars=request_vars)
            entry.update_record(**request_vars)
        else:
            ret['error'] = 'No record with id ' + str(entryId)
            return response.json(ret)
    #   otherwise, create a new record
    else:
        entryId = db[table].insert(**request_vars)

    #   dependencies are simple linking records, so don't bother to update them;
    #   just delete all existing dependencies on this record and insert the new set
    if entryId:
        if depTable:
            if 'id' in request_vars:
                db(db[depTable][table] == request_vars['id']).delete()
            for dep,load in deps.items():
                if not dep:
                    continue
                depRecord = db[depTable][dep]
                if table == 'framework' and depRecord and depRecord.name == 'General':
                    continue
                db[depTable].insert(**{table: entryId, 'dependency': dep})
                if load and table == 'framework':
                    ret['entries'].update(getFramework(dep))

    ret['id'] = entryId
    ret['entries'].update({table: {entryId: getEntry(table, entryId)}})
    ret['success'] = True
    return response.json(ret)


#   This is called when the user clicks the 'Save' button on the law editing diagram.  It saves
#   the entire relation tree of the law, ie. all of the individual nodes.  It will update node records that
#   are already stored, insert new nodes, and delete nodes that the user has removed from the tree.
#
#   called from interface.js
#
def saveRelation():
    import json, urllib
    body = request.body.read()
    body = urllib.unquote(body).decode('utf8')

    print('{timestamp} -- saving law').format(timestamp=datetime.utcnow().isoformat())
    print('BODY: {body}').format(body=body)

    #   parse the request parameters
    request_vars = json.loads(body)

    lawId = int(request_vars['id'])
    frameworkId = -1
    if 'framework' in request_vars:
        frameworkId = int(request_vars['framework'])
    nodes = request_vars['nodes']
    predicates = request_vars['predicates']
    ret = {'success': False}
    entries = {'law': {}, 'node': {}}

    #   if we are saving a tree where its law metadata hasn't been created yet, make a dummy law record for now
    #   - this is a temp fix - really, the JavaScript should prompt the user for the law info first and then save the
    #   law and its tree together
    oldId = None
    if lawId < 0:
        oldId = lawId
        lawId = db.law.insert(name = 'New Law', framework = frameworkId)

    #   insert or update all nodes of this law, keeping a map from passed to stored ID's since
    #   newly added nodes had a temporary negative ID number until now
    idMap = {None: None}
    allNodes = {}
    for node in nodes:
        nodeName = None
        if 'name' in node:
            nodeName = node['name']
        nodeId = db.node.update_or_insert(db.node.id == node['id'],
            law=lawId, concept=node['concept'], node_values=node['value'],
            name=nodeName, head=None, reference=None)

        #if my concept is specific to me, make sure it has a context entry
        concept = db(db.concept.id == node['concept']).select().first()
        if concept and concept.node_specific:
            context = db(db.concept_context.concept == concept.id).select().first()
            if context:
                context.update_record(node = nodeId)
            else:
                db.concept_context.insert(concept = concept.id, node = nodeId)

        #mark this node to be kept - all unmarked nodes linked to this law are no longer used
        if nodeId is None:
            nodeId = node['id']
        else:
            row = db.node[nodeId]
            print('Created node: {row}').format(row=row)

        #nodes that were already stored will not change ID, but new nodes will change from a temporary
        #negative ID number to a valid ID in the table
        idMap[node['id']] = nodeId
        allNodes[nodeId] = True

    print('Keeping nodes: {allNodes}').format(allNodes=allNodes)

    #delete all nodes that are no longer in this law
    deletedNodes = {}
    for node in db(db.node.law == lawId).iterselect():
        db(db.predicate.node == node.id).delete()
        if node.id not in allNodes:
            deletedNodes[node.id] = True
            node.delete_record()

    print('Deleted nodes: {deletedNodes}').format(deletedNodes=deletedNodes)

    #delete all node-specific concepts that are no longer used by their node
    for concept in db(db.concept.node_specific == True).iterselect():
        node = db(db.node.concept == concept.id).select().first()
        if node is None:
            concept.delete_record()

    #now that all nodes are in the table, link each to its head and reference
    for node in nodes:
        newId = idMap[node['id']]
        db(db.node.id == newId).update(head = idMap[node['head']], reference = idMap[node['reference']])
        entries['node'][newId] = getEntry('node', newId)
        entries['node'][newId]['oldId'] = node['id']

    #mark all deep predicate nodes of this law by their group number
    for predicate in predicates:
        newId = idMap[predicate['node']]
        group = predicate['predicate_group']
        db.predicate.insert(node=newId, predicate_group=group)

    entries['law'][lawId] = getEntry('law', lawId)
    if oldId is not None:
        entries['law'][lawId]['oldId'] = oldId

    ret['entries'] = entries
    ret['success'] = True
    return response.json(ret)


#   Auxiliary function (not a request handler): grabs an individual database record and cleans it up so it's
#   in the format that the JavaScript expects to receive it.  For example, for a framework record
#   we have to include all frameworks required by the given framework, so we have to pull those from the
#   framework_dependency table
#
def getEntry(table, data):
    ret = {}
    if isinstance(data, int) or isinstance(data, unicode) or isinstance(data, str):
        entry = db[table][data]
    else:
        entry = data
    if not entry:
        return response.json(ret)
    if table == 'framework':
        ret = {'id': entry.id, 'name': entry.name, 'description': entry.description, 'dependencies': {}}
        for dep in db(db.framework_dependency.framework == entry.id).iterselect():
            ret['dependencies'][dep.dependency] = True
        #include the general frameworks by default
        for framework in db((db.framework.name == 'General')).iterselect():
            ret['dependencies'][framework.id] = True
    elif table == 'concept':
        ret = {'id': entry.id, 'name': entry.name, 'description': entry.description, 'framework': entry.framework, \
            'law_specific': entry.law_specific, 'node_specific': entry.node_specific, 'head': entry.head, \
            'reference': entry.reference, 'symbol': entry.symbol, 'commands': entry.commands, 'dependencies': {},\
            'symmetric': entry.symmetric or False, 'value': entry.value, 'inherits': entry.inherits or False};
        for dep in db(db.concept_dependency.concept == entry.id).iterselect():
            ret['dependencies'][dep.dependency] = True
        row = db(db.concept_context.concept == entry.id).select().first()
        if row is not None:
            ret['node'] = row.node
    elif table == 'law':
        ret = {'id': entry.id, 'name': entry.name, 'description': entry.description, 'framework': entry.framework, \
            'hashtags': entry.hashtags, 'nodes': [], 'predicates': {}};
        for node in db(db.node.law == entry.id).iterselect():
            ret['nodes'].append(node.id)
            for predicate in db(db.predicate.node == node.id).iterselect():
                if predicate.predicate_group not in ret['predicates']:
                    ret['predicates'][predicate.predicate_group] = {}
                ret['predicates'][predicate.predicate_group][node.id] = True
    elif table == 'node':
        ret = {'id': entry.id, 'law': entry.law, 'concept': entry.concept, 'head': entry.head, \
            'reference': entry.reference, 'name': entry.name, 'value': entry.node_values};
    return ret


#   Auxiliary function: retrieves all framework metadata, and if a specific framework is given,
#   retrieves all concepts, laws, and nodes that are part of that framework
#
def getFramework(frameworkId):

    frameworkId = int(frameworkId)

    entries = {'framework': {}, 'concept': {}, 'law': {}, 'node': {}}

    #   include the metadata for all frameworks, in case it hasn't been loaded yet or has been updated
    #   by another user
    for framework in db(db.framework.id > 0).iterselect():
        entries['framework'][framework.id] = getEntry('framework', framework)

    #   include all concepts not specific to any framework (ROOT and Anything)
    for concept in db(db.concept.framework == None).iterselect():
        entries['concept'][concept.id] = getEntry('concept', concept)

    frameworks = []
    if frameworkId > 0:
        frameworks.append(frameworkId)
    else:
        #include the general framework by default
        for framework in db((db.framework.name == 'General')).iterselect():
            frameworks.append(framework.id)
        pass

    loaded = {}
    while frameworks:
        fid = frameworks.pop(0)
        loaded[fid] = True
        entries['framework'][fid]['loaded'] = True
        for concept in db(db.concept.framework == fid).iterselect():
            entries['concept'][concept.id] = getEntry('concept', concept)
        for law in db(db.law.framework == fid).iterselect():
            entries['law'][law.id] = getEntry('law', law)
            for node in db(db.node.law == law.id).iterselect():
                entries['node'][node.id] = getEntry('node', node)
        for dep in entries['framework'][fid]['dependencies']:
            if dep not in frameworks and dep not in loaded:
                frameworks.append(dep)

    return entries



#   This serves a test page I was using to learn how to display MathML.  Not needed by the main site
#   but useful for testing rendering of math symbols via MathML
#
def mathjax():
    return dict()



#   Below are the default handlers provided by web2py - these are not used right now but could be useful...
#   'index' in particular is the default page the user sees if they don't add the /default/knowledge URL suffix
#
# -------------------------------------------------------------------------
# - index is the default action of any application
# - user is required for authentication and authorization
# - download is for downloading files uploaded in the db (does streaming)
# -------------------------------------------------------------------------


def index():
    """
    example action using the internationalization operator T and flash
    rendered by views/default/index.html or views/generic.html

    if you need a simple wiki simply replace the two lines below with:
    return auth.wiki()
    """
    response.flash = T("Hello World")
    return dict(message=T('Welcome to the Concept Graph!'))


def user():
    """
    exposes:
    http://..../[app]/default/user/login
    http://..../[app]/default/user/logout
    http://..../[app]/default/user/register
    http://..../[app]/default/user/profile
    http://..../[app]/default/user/retrieve_password
    http://..../[app]/default/user/change_password
    http://..../[app]/default/user/bulk_register
    use @auth.requires_login()
        @auth.requires_membership('group name')
        @auth.requires_permission('read','table name',record_id)
    to decorate functions that need access control
    also notice there is http://..../[app]/appadmin/manage/auth to allow administrator to manage users
    """
    return dict(form=auth())


@cache.action()
def download():
    """
    allows downloading of uploaded files
    http://..../[app]/default/download/[filename]
    """
    return response.download(request, db)


def call():
    """
    exposes services. for example:
    http://..../[app]/default/call/jsonrpc
    decorate with @services.jsonrpc the functions to expose
    supports xml, json, xmlrpc, jsonrpc, amfrpc, rss, csv
    """
    return service()


