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
    db['concept'].update_or_insert(id=1, name='ROOT', description='root of the concept tree')

    #   also the 'relation' concept, which represents the root of a relation
    db['concept'].update_or_insert(id=2, name='RELATION', description='a specific relation')

    #   There are no URL options for the main page and knowledge.html handles everything so we just
    #   return an empty Python dictionary
    return dict()


#   AJAX HANDLERS & HELPER FUNCTIONS
#   The rest of the handlers are called by the JavaScript on the page, via AJAX.
#   They load and save records from the database.


def loadRecord():

    table = request.vars.table
    recordId = int(request.vars.id)

    records = {}

    loadRecordHelper(table, db[table][recordId], records)

    return response.json(records)


def loadRecordHelper(table, record, records):

    if table not in records:
        records[table] = {}

    if record.id in records[table]:
        return

    rec = record.as_dict()

    rec['instance_of'] = {}
    rec['instance'] = {}
    rec['head_of'] = {}
    rec['reference_of'] = {}

    for con in db(db.concept.head == record.id).iterselect():
        loadRecordHelper('concept', con, records)
        rec['head_of'][con.id] = True

    for con in db(db.concept.reference == record.id).iterselect():
        loadRecordHelper('concept', con, records)
        rec['reference_of'][con.id] = True

    for dep in db(db.concept_instance_of.concept == record.id).iterselect():
        loadRecordHelper('concept', db['concept'][dep.instance_of], records)
        rec['instance_of'][dep.instance_of] = True

    for dep in db(db.concept_instance_of.instance_of == record.id).iterselect():
        loadRecordHelper('concept', db['concept'][dep.concept], records)
        rec['instance'][dep.concept] = True

    records[table][record.id] = rec


def saveRecords():

    import json, urllib
    body = request.body.read()
    body = urllib.unquote(body).decode('utf8')
    request_vars = json.loads(body)
    records = request_vars['records']

    newRecords = {}

    for table in records:
        newRecords[table] = {}
        for rid in records[table]:
            record = records[table][rid]

            if 'deleted' in record:
                db(db[table].id == rid).delete()
                continue

            existing = None
            try:
                if int(rid) > 0:
                    existing = db[table][rid]
            except ValueError:
                pass

            if existing:
                existing.update_record(**record)
            else:
                newId = db[table].insert(**record)
                newRecords[table][newId] = {'oldId': rid}

        db.executesql('alter table {} auto_increment=1'.format(table))

    return response.json(newRecords)


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


