# -*- coding: utf-8 -*-
# this file is released under public domain and you can use without limitations

# -------------------------------------------------------------------------
# This is a sample controller
# - index is the default action of any application
# - user is required for authentication and authorization
# - download is for downloading files uploaded in the db (does streaming)
# -------------------------------------------------------------------------


from datetime import datetime


def index():
    """
    example action using the internationalization operator T and flash
    rendered by views/default/index.html or views/generic.html

    if you need a simple wiki simply replace the two lines below with:
    return auth.wiki()
    """
    response.flash = T("Hello World")
    return dict(message=T('Welcome to the Concept Graph!'))


def knowledge():
    return dict()


def mathjax():
    return dict()


def concept():
    db.framework_dependency.framework.writable = False
    db.concept.framework.writable = False
    db.law.framework.writable = False
    form = SQLFORM.smartgrid(db.framework,
        user_signature=False,
        links={
            'framework': [lambda row: A('Use', _href='javascript:relation.useFramework('+str(row.id)+')')],
            'law': [lambda row: A('Use', _href='javascript:relation.useLaw('+str(row.id)+')')]
        },
        linked_tables=[db.framework_dependency.framework, 'concept', 'law', db.concept_dependency.concept])
    return locals()


def entry():
    table = request.vars.table
    return locals()


def create_edit():
    table = request.vars.table
    type = request.vars.type
    return locals()


def loadFramework():
    frameworkId = int(request.vars.framework)
    ret = {}
    ret['entries'] = getFramework(frameworkId)
    rows = db.executesql("select `auto_increment` from information_schema.tables where table_name = 'node'")
    ret['nextNodeId'] = rows[0][0]
    return response.json(ret)


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
        #include the visualization and symbolization frameworks by default
        for framework in db((db.framework.name == 'Visualization') | (db.framework.name == 'Symbolization')).iterselect():
            ret['dependencies'][framework.id] = True
    elif table == 'concept':
        ret = {'id': entry.id, 'name': entry.name, 'description': entry.description, 'framework': entry.framework, \
            'law': entry.law, 'symmetric': entry.symmetric or False, 'head': entry.head, 'reference': entry.reference, \
            'symbol': entry.symbol, 'value': entry.value, 'inherits': entry.inherits or False, 'dependencies': {}};
        for dep in db(db.concept_dependency.concept == entry.id).iterselect():
            ret['dependencies'][dep.dependency] = True
    elif table == 'law':
        ret = {'id': entry.id, 'name': entry.name, 'description': entry.description, 'framework': entry.framework, \
            'nodes': [], 'predicates': {}, 'notDeepNode': {}};
        for node in db(db.node.law == entry.id).iterselect():
            ret['nodes'].append(node.id)
            for predicate in db(db.predicate.node == node.id).iterselect():
                if predicate.predicate_group not in ret['predicates']:
                    ret['predicates'][predicate.predicate_group] = {}
                ret['predicates'][predicate.predicate_group][node.id] = True
            if node.head:
                ret['notDeepNode'][node.head] = True
            if node.reference:
                ret['notDeepNode'][node.reference] = True
    elif table == 'node':
        ret = {'id': entry.id, 'law': entry.law, 'concept': entry.concept, 'head': entry.head, \
            'reference': entry.reference, 'name': entry.name, 'value': entry.node_values};
    return ret


def getFramework(frameworkId):

    frameworkId = int(frameworkId)

    entries = {'framework': {}, 'concept': {}, 'law': {}, 'node': {}}

    #include the metadata for all frameworks
    for framework in db(db.framework.id > 0).iterselect():
        entries['framework'][framework.id] = getEntry('framework', framework)

    #include all concepts not specific to any framework (ROOT and Anything)
    for concept in db(db.concept.framework == None).iterselect():
        entries['concept'][concept.id] = getEntry('concept', concept)

    frameworks = []
    if frameworkId > 0:
        frameworks.append(frameworkId)
    else:
        #include the visualization and symbolization frameworks by default
        for framework in db((db.framework.name == 'Visualization') | (db.framework.name == 'Symbolization')).iterselect():
            frameworks.append(framework.id)

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


def saveEntry():
    import json, urllib
    body = request.body.read()
    body = urllib.unquote(body).decode('utf8')

    print('{timestamp} -- saving entry').format(timestamp=datetime.utcnow().isoformat())
    print('BODY: {body}').format(body=body)

    request_vars = json.loads(body)

    ret = {'success': False, 'entries': {}}

    table = None
    if 'table' in request_vars:
        table = request_vars['table']
        del request_vars['table']
    else:
        return response.json(ret)

    depTable = None
    if table == 'framework':
        depTable = 'framework_dependency'
    elif table == 'concept':
        depTable = 'concept_dependency'

    deps = {}
    if 'dependencies' in request_vars:
        deps = request_vars['dependencies']
        del request_vars['dependencies']

    if table == 'concept' and 'law_specific' in request_vars:
        if 'law_specific' is not 'on':
            request_vars['law'] = None
        del request_vars['law_specific']

    if 'id' in request_vars:
        entryId = request_vars['id']
        entry = db[table][entryId]
        if entry:
            print('UPDATING: {vars}').format(vars=request_vars)
            entry.update_record(**request_vars)
        else:
            ret['error'] = 'No record with id ' + str(entryId)
            return response.json(ret)
    else:
        entryId = db[table].insert(**request_vars)

    if entryId and depTable:
        if 'id' in request_vars:
            db(db[depTable][table] == request_vars['id']).delete()
        for dep,load in deps.items():
            db[depTable].insert(**{table: entryId, 'dependency': dep})
            if load:
                if table == 'framework':
                    ret['entries'].update(getFramework(dep))

    ret['id'] = entryId
    ret['entries'].update({table: {entryId: getEntry(table, entryId)}})
    ret['success'] = True
    return response.json(ret)


def saveRelation():
    import json, urllib
    body = request.body.read()
    body = urllib.unquote(body).decode('utf8')

    print('{timestamp} -- saving law').format(timestamp=datetime.utcnow().isoformat())
    print('BODY: {body}').format(body=body)

    request_vars = json.loads(body)

    lawId = int(request_vars['id'])
    frameworkId = -1
    if 'framework' in request_vars:
        frameworkId = int(request_vars['framework'])
    nodes = request_vars['nodes']
    predicates = request_vars['predicates']
    ret = {'success': False}
    entries = {'law': {}, 'node': {}}

    oldId = None
    if lawId < 0:
        oldId = lawId
        lawId = db.law.insert(name = 'New Law', framework = frameworkId)

    idMap = {None: None}
    allNodes = {}
    for node in nodes:
        nodeName = None
        if 'name' in node:
            nodeName = node['name']
        nodeId = db.node.update_or_insert(db.node.id == node['id'],
            law=lawId, concept=node['concept'], node_values=node['value'],
            name=nodeName, head=None, reference=None)
        if nodeId is None:
            nodeId = node['id']
        else:
            row = db.node[nodeId]
            print('Created node: {row}').format(row=row)
        idMap[node['id']] = nodeId
        allNodes[nodeId] = True

    print('Keeping nodes: {allNodes}').format(allNodes=allNodes)

    deletedNodes = {}
    for node in db(db.node.law == lawId).iterselect():
        db(db.predicate.node == node.id).delete()
        if node.id not in allNodes:
            deletedNodes[node.id] = True
            node.delete_record()

    print('Deleted nodes: {deletedNodes}').format(deletedNodes=deletedNodes)

    for node in nodes:
        newId = idMap[node['id']]
        db(db.node.id == newId).update(head = idMap[node['head']], reference = idMap[node['reference']])
        entries['node'][newId] = getEntry('node', newId)
        entries['node'][newId]['oldId'] = node['id']
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


