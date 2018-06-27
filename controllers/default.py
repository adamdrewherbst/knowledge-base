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
        linked_tables=[db.framework_dependency.framework, 'concept', 'law'])
    return locals()


def useFrameworkOrLaw():
    currentFramework = int(request.vars.currentFramework or -1)
    currentLaw = int(request.vars.currentLaw or -1)
    recordType = request.vars.type
    recordId = int(request.vars.id)

    ret = {'frameworks': [], 'law': {'nodes': {}}}

    print('{timestamp} -- using framework').format(timestamp=datetime.utcnow().isoformat())

    if (recordType == 'framework' and recordId == currentFramework) \
        or (recordType == 'law' and recordId == currentLaw):
            ret['message'] = "Framework %d already in use" % recordId
            return response.json(ret)

    if recordType == 'framework':
        newFramework = recordId
    elif recordType == 'law' and recordId != currentLaw:
        rows = db(db.law.id == recordId).select()
        law = rows[0]
        ret['law']['id'] = law.id
        ret['law']['name'] = law.name
        ret['law']['description'] = law.description
        ret['law']['framework'] = law.framework
        for node in db(db.node.law == recordId).iterselect():
            ret['law']['nodes'][node.id] = \
                {'id': node.id, 'law': recordId, 'concept': node.concept, 'head': node.head, 'reference': node.reference}
        newFramework = law.framework

    #collect the concepts corresponding to the new framework and all its dependencies
    if newFramework != currentFramework:
        frameworks = [newFramework]
        while frameworks:
            fid = frameworks.pop(0)
            rows = db(db.framework.id == fid).select()
            framework = rows[0]
            ret['frameworks'].append(
                {'id': fid, 'name': framework.name, 'description': framework.description, 'concepts': []});
            for concept in db(db.concept.framework == fid).iterselect():
                ret['frameworks'][-1]['concepts'].append(
                    {'id': concept.id, 'name': concept.name, 'description': concept.description, 'framework': fid});
            for dep in db(db.framework_dependency.framework == fid).iterselect(db.framework_dependency.dependency):
                frameworks.append(dep.dependency)

    print('{timestamp} -- done using framework').format(timestamp=datetime.utcnow().isoformat())

    return response.json(ret)


def saveLaw():
    import json, urllib
    body = request.body.read()
    body = urllib.unquote(body).decode('utf8')

    print('{timestamp} -- saving law').format(timestamp=datetime.utcnow().isoformat())
    print('BODY: {body}').format(body=body)

    request_vars = json.loads(body)

    lawId = int(request_vars['id'])
    nodes = request_vars['nodes']
    ret = {'success': False}

    db(db.node.law == lawId).delete()

    idMap = {None: None}
    for node in nodes:
        #data = {'law': lawId, 'concept': node['concept'], 'predicate': node['predicate']}
        nodeId = db.node.update_or_insert(db.node.id == node['id'],
            id=node['id'], law=lawId, concept=node['concept'], predicate=node['predicate'])
        idMap[node['id']] = nodeId
    for node in nodes:
        db(db.node.id == idMap[node['id']]).update(head = idMap[node['head']], reference = idMap[node['reference']])

    ret['success'] = True
    return response.json(ret)


def initRelation():

    lawId = request.vars.law
    rows = db(db.law.id == lawId).select()
    relation = rows[0]

    ret = {'myNodes': [], 'concepts': {}, 'laws': {}, 'nodes': {}, 'predicates': {}, 'nextNodeId': -1}

    frameworks = [relation.framework]
    while frameworks:
        fid = frameworks.pop(0)
        for concept in db(db.concept.framework == fid).iterselect():
            ret['concepts'][concept.id] = {'id': concept.id, 'name': concept.name, 'description': concept.description, 'framework': fid};
        for law in db(db.law.framework == fid).iterselect():
            ret['laws'][law.id] = {'id': law.id, 'name': law.name, 'description': law.description, 'predicates': {}};
            for node in db(db.node.law == law.id).iterselect():
                ret['nodes'][node.id] = \
                    {'id': node.id, 'law': node.law, 'concept': node.concept, 'head': node.head, 'reference': node.reference};
                for predicate in db(db.predicate.node == node.id).iterselect():
                    ret['predicates'][node.concept] = node.id   #not clear how to avoid repeating this command
                    ret['laws'][law.id]['predicates'].setdefault(predicate.predicate_group, {})[node.id] = True
                if law.id == lawId:
                    ret['myNodes'].append(node.id)
                if node.id >= ret['nextNodeId']:
                    ret['nextNodeId'] = node.id + 1
        for dep in db(db.framework_dependency.framework == fid).iterselect(db.framework_dependency.dependency):
            frameworks.append(dep.dependency)

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


