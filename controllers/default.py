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
#   render the page for the user.  You can add a new page to the site in the same way.
#
def knowledge():

    #   make sure the global ROOT concept exists; this is the root of the tree of all concepts
    db.concept.update_or_insert(db.concept.name == 'ROOT',
        name = 'ROOT', description = 'root of the concept tree')
    db.concept.update_or_insert(db.concept.name == 'in',
        name = 'in', description = 'one concept belongs within another')
    db.concept.update_or_insert(db.concept.name == 'is a',
        name = 'is a', description = 'one concept is an instance of another')

    rootId = db(db.concept.name == 'ROOT').select().first().id
    inId = db(db.concept.name == 'in').select().first().id
    isAId = db(db.concept.name == 'is a').select().first().id

    db.part.update_or_insert(db.part.concept == rootId,
        concept = rootId)

    rootNode = db(db.part.concept == rootId).select().first().id

    db.part.update_or_insert((db.part.concept == inId) & (db.part.end == rootNode),
        concept = inId, end = rootNode)
    db.part.update_or_insert((db.part.concept == isAId) & (db.part.end == rootNode),
        concept = isAId, end = rootNode)

    #   There are no URL options for the main page and knowledge.html handles everything so we just
    #   return an empty Python dictionary
    return dict()


#   AJAX HANDLERS & HELPER FUNCTIONS
#   The rest of the handlers are called by the JavaScript on the page, via AJAX.
#   They load and save records from the database.


def load():

    import json, urllib
    body = request.body.read()
    body = urllib.unquote(body).decode('utf8')
    request_vars = json.loads(body)

    records = {'concept': {}, 'part': {}}

    loadPart(1, records)

    return response.json(records)


def loadPart(partId, records):

    if partId in records['part']:
        return

    part = db.part(partId)
    records['part'][partId] = part.as_dict()

    loadConcept(part.concept, records)
    if part.start is not None:
        loadPart(part.start, records)
    if part.end is not None:
        loadPart(part.end, records)
    for part in db((db.part.start == partId) | (db.part.end == partId)).iterselect():
        loadPart(part.id, records)


def loadConcept(conceptId, records):

    if conceptId in records['concept']:
        return

    concept = db.concept(conceptId)
    records['concept'][conceptId] = concept.as_dict()


def save():

    import json, urllib
    body = request.body.read()
    body = urllib.unquote(body).decode('utf8')
    request_vars = json.loads(body)
    records = request_vars['records']

    print('SAVING RECORDS')
    print('{}'.format(records))

    records['saved'] = {'concept': {}, 'part': {}}

    for cid in records['concept']:
        saveRecord(records, 'concept', cid)
    for pid in records['part']:
        saveRecord(records, 'part', pid)

    db.executesql('alter table concept auto_increment=1')
    db.executesql('alter table part auto_increment=1')

    for table in records['saved']:
        for rid in records['saved'][table]:
            rid = str(rid)
            newId = str(records['saved'][table][rid])
            if newId != rid:
                records[table][newId] = records[table][rid]
                del records[table][rid]

    del records['saved']

    return response.json(records)


def saveRecord(records, table, rid):

    rid = str(rid)
    if rid in records['saved'][table]:
        return records['saved'][table][rid]

    record = records[table][rid]

    if table is 'part':
        if 'concept' in record and record['concept'] is not None:
            record['concept'] = saveRecord(records, 'concept', record['concept'])
        if 'start' in record and record['start'] is not None:
            record['start'] = saveRecord(records, 'part', record['start'])
        if 'end' in record and record['end'] is not None:
            record['end'] = saveRecord(records, 'part', record['end'])

    if 'deleted' in record:
        db(db[table].id == record['id']).delete()
    elif 'id' in record:
        db[table][record['id']].update_record(**record)
    else:
        record['id'] = db[table].insert(**record)

    if str(record['id']) != str(rid):
        record['oldId'] = rid

    records['saved'][table][rid] = str(record['id'])
    return record['id']


def isint(val):
    try:
        int(val)
        return True
    except TypeError:
        return False
    except ValueError:
        return False

def positive(val):
    return isint(val) and int(val) > 0


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


